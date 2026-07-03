use mesh_client::models::catalog::{MODEL_CATALOG, parse_size_gb};
use mesh_client::network::nostr::auto_model_pack;
use mesh_llm_node::models::{default_huggingface_cache_dir, scan_installed_models};
use mesh_llm_system::hardware;
use mesh_llm_system::vram::format_rated_capacity;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct HardwareReport {
    pub gpu_name: Option<String>,
    pub gpu_count: u8,
    pub is_soc: bool,
    pub vram_bytes: u64,
    pub vram_gb: f64,
    pub vram_display: String,
    pub hostname: Option<String>,
    /// Free space on the volume that holds the model cache. Zero if the probe
    /// failed (the UI shows "—" rather than a wrong number).
    pub disk_free_bytes: u64,
    pub disk_free_display: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct RecommendedModel {
    pub name: String,
    pub reason: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CatalogEntry {
    pub name: String,
    pub file: String,
    pub size: String,
    pub size_gb: f64,
    pub description: String,
    pub fit: &'static str,
    pub installed: bool,
    pub recommended: bool,
    /// Set when this entry is a speculative-decoding draft model rather than
    /// something a person would chat with directly.
    pub draft: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct DiagnoseReport {
    pub hardware: HardwareReport,
    pub recommended: Option<RecommendedModel>,
    pub catalog: Vec<CatalogEntry>,
}

/// Reimplementation of mesh-llm's private `fit_code_for_size_label`
/// (crates/mesh-llm-host-runtime/src/models/search.rs): how a model of
/// `model_gb` sits inside `vram_gb` of usable AI memory.
pub fn fit_code(model_gb: f64, vram_gb: f64) -> &'static str {
    if model_gb <= vram_gb * 0.6 {
        "comfortable"
    } else if model_gb <= vram_gb * 0.9 {
        "tight"
    } else if model_gb <= vram_gb * 1.1 {
        "tradeoff"
    } else {
        "too_large"
    }
}

fn fit_rank(fit: &str) -> u8 {
    match fit {
        "comfortable" => 0,
        "tight" => 1,
        "tradeoff" => 2,
        _ => 3,
    }
}

pub fn diagnose() -> DiagnoseReport {
    let survey = hardware::survey();
    let vram_gb = survey.vram_bytes as f64 / 1e9;

    let cache_dir = default_huggingface_cache_dir();
    let disk_free_bytes = free_disk_bytes(&cache_dir);

    let hardware = HardwareReport {
        gpu_name: survey.gpu_name.clone(),
        gpu_count: survey.gpu_count,
        is_soc: survey.is_soc,
        vram_bytes: survey.vram_bytes,
        vram_gb,
        vram_display: format_rated_capacity(survey.vram_bytes),
        hostname: survey.hostname.clone(),
        disk_free_bytes,
        disk_free_display: format_disk(disk_free_bytes),
    };

    let recommended_name = auto_model_pack(vram_gb).into_iter().next();
    let recommended = recommended_name.clone().map(|name| RecommendedModel {
        reason: format!("Best fit for {} of AI memory", hardware.vram_display),
        name,
    });

    let installed = scan_installed_models(&cache_dir);
    let is_installed = |file: &str, name: &str| {
        installed.iter().any(|m| {
            m.path.file_name().and_then(|f| f.to_str()) == Some(file) || m.model_ref.contains(name)
        })
    };

    let mut catalog: Vec<CatalogEntry> = MODEL_CATALOG
        .iter()
        .map(|m| {
            let size_gb = parse_size_gb(&m.size);
            CatalogEntry {
                fit: fit_code(size_gb, vram_gb),
                installed: is_installed(&m.file, &m.name),
                recommended: recommended_name.as_deref() == Some(m.name.as_str()),
                draft: m.draft.is_some(),
                name: m.name.clone(),
                file: m.file.clone(),
                size: m.size.clone(),
                size_gb,
                description: m.description.clone(),
            }
        })
        .collect();

    // Recommended first, then by fit class, then larger models first within a class.
    catalog.sort_by(|a, b| {
        b.recommended
            .cmp(&a.recommended)
            .then(fit_rank(a.fit).cmp(&fit_rank(b.fit)))
            .then(b.size_gb.total_cmp(&a.size_gb))
    });

    DiagnoseReport {
        hardware,
        recommended,
        catalog,
    }
}

/// Free bytes on the volume backing `path`. macOS-only shell-out to `df` (the
/// app never ships elsewhere); returns 0 on any parse/exec failure so the UI
/// can fall back to "—" instead of showing a wrong figure.
fn free_disk_bytes(path: &std::path::Path) -> u64 {
    // `df` needs an existing path; walk up to the nearest ancestor that exists
    // (the HF cache dir may not be created until the first download).
    let mut probe = path;
    while !probe.exists() {
        match probe.parent() {
            Some(parent) => probe = parent,
            None => return 0,
        }
    }
    let output = match std::process::Command::new("df")
        .args(["-k", "-P"])
        .arg(probe)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return 0,
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    // POSIX `df -P` prints a header then one data line; the 4th column is
    // available 1K-blocks.
    stdout
        .lines()
        .nth(1)
        .and_then(|line| line.split_whitespace().nth(3))
        .and_then(|kb| kb.parse::<u64>().ok())
        .map(|kb| kb * 1024)
        .unwrap_or(0)
}

fn format_disk(bytes: u64) -> String {
    if bytes == 0 {
        return "—".to_string();
    }
    let gb = bytes as f64 / 1e9;
    if gb >= 1000.0 {
        format!("{:.1} TB", gb / 1000.0)
    } else if gb >= 10.0 {
        format!("{} GB", gb.round() as u64)
    } else {
        format!("{gb:.1} GB")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors the thresholds in mesh-llm-host-runtime/src/models/search.rs
    // (fit_code_for_size_label). If upstream changes, these should be revisited.
    #[test]
    fn fit_thresholds_match_upstream() {
        let vram = 48.0;
        assert_eq!(fit_code(18.0, vram), "comfortable"); // GLM-4.7-Flash on 48GB
        assert_eq!(fit_code(28.7, vram), "comfortable"); // just under 0.6x
        assert_eq!(fit_code(40.0, vram), "tight");
        assert_eq!(fit_code(43.1, vram), "tight"); // just under 0.9x
        assert_eq!(fit_code(50.0, vram), "tradeoff");
        assert_eq!(fit_code(52.7, vram), "tradeoff"); // just under 1.1x
        assert_eq!(fit_code(60.0, vram), "too_large");
    }

    #[test]
    fn recommendation_tiers() {
        assert_eq!(
            auto_model_pack(56.0).first().unwrap(),
            "GLM-4.7-Flash-Q4_K_M"
        );
        assert_eq!(auto_model_pack(4.0).first().unwrap(), "Qwen3-4B-Q4_K_M");
    }

    #[test]
    fn diagnose_produces_full_catalog() {
        let report = diagnose();
        assert!(
            report.catalog.len() >= 30,
            "expected the full curated catalog"
        );
        assert!(report.hardware.vram_bytes > 0);
        // The disk probe runs against a real volume in the dev/CI sandbox.
        assert!(
            report.hardware.disk_free_bytes > 0,
            "expected a real free-disk figure"
        );
        assert_ne!(report.hardware.disk_free_display, "—");
    }

    #[test]
    fn format_disk_scales_and_falls_back() {
        assert_eq!(format_disk(0), "—");
        assert_eq!(format_disk(512 * 1_000_000_000), "512 GB");
        assert_eq!(format_disk(2_500 * 1_000_000_000), "2.5 TB");
        assert_eq!(format_disk(4_400_000_000), "4.4 GB");
    }
}
