//! mesh-console's own opinionated model overlay.
//!
//! The upstream mesh-llm catalog (`mesh_client::models::catalog::MODEL_CATALOG`)
//! is a broad curated list. This overlay lets mesh-console add its own picks and
//! — more importantly — make its own recommendation for a given machine size,
//! independent of upstream's `auto_model_pack` tiers.
//!
//! Overlay models are NOT in mesh-llm's catalog, so their display `name` won't
//! resolve on its own. Each entry therefore carries a `model_ref`: a Hugging
//! Face ref (`org/repo/file.gguf`) that mesh-llm's resolver understands. When a
//! user picks an overlay model, [`resolve_ref`] translates the name the UI sends
//! back into that ref before the node downloads/serves it.

use serde::Deserialize;
use std::sync::LazyLock;

#[derive(Clone, Debug, Deserialize)]
pub struct OverlayModel {
    /// Display name shown in the UI and sent back as the "model" string.
    pub name: String,
    /// GGUF filename (used for the installed-on-disk check).
    pub file: String,
    /// Hugging Face ref the resolver understands (`org/repo/file.gguf`).
    pub model_ref: String,
    /// Human size label, e.g. "16.9GB" (parsed by `parse_size_gb`).
    pub size: String,
    pub description: String,
    /// When set, this model is the recommended pick for machines whose usable
    /// AI memory (VRAM, GB) is at least this value. The highest matching
    /// threshold across all overlay models wins.
    #[serde(default)]
    pub recommend_min_vram_gb: Option<f64>,
}

/// The bundled overlay, compiled in at build time.
pub static OVERLAY_MODELS: LazyLock<Vec<OverlayModel>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("models.json")).expect("parse bundled models.json")
});

/// mesh-console's opinionated recommendation for a machine with `vram_gb` of
/// usable AI memory, if any overlay model claims it. Picks the entry with the
/// highest `recommend_min_vram_gb` that the machine still satisfies, so bigger
/// machines get the more capable pick.
pub fn recommended_for(vram_gb: f64) -> Option<&'static OverlayModel> {
    OVERLAY_MODELS
        .iter()
        .filter(|m| m.recommend_min_vram_gb.is_some_and(|min| vram_gb >= min))
        .max_by(|a, b| {
            a.recommend_min_vram_gb
                .unwrap()
                .total_cmp(&b.recommend_min_vram_gb.unwrap())
        })
}

/// If `name` is an overlay model, return its Hugging Face ref (what the resolver
/// needs); otherwise `None` (the name is an upstream catalog id and resolves on
/// its own).
pub fn resolve_ref(name: &str) -> Option<&'static str> {
    OVERLAY_MODELS
        .iter()
        .find(|m| m.name == name)
        .map(|m| m.model_ref.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_parses_and_has_gemma() {
        let gemma = OVERLAY_MODELS
            .iter()
            .find(|m| m.name.contains("Gemma-4-26B"))
            .expect("gemma overlay entry present");
        assert!(
            gemma
                .model_ref
                .starts_with("unsloth/gemma-4-26B-A4B-it-GGUF/")
        );
        assert_eq!(gemma.recommend_min_vram_gb, Some(50.0));
    }

    #[test]
    fn recommends_gemma_on_64gb_not_on_32gb() {
        // A 64 GB M-series reports ~55 GB usable AI memory → gemma.
        assert_eq!(
            recommended_for(55.0).map(|m| m.name.as_str()),
            Some("Gemma-4-26B-A4B-it-Q4_K_M")
        );
        // A 32 GB machine reports well under 50 → no overlay recommendation,
        // so diagnose falls back to the upstream pick.
        assert!(recommended_for(22.0).is_none());
    }

    #[test]
    fn resolve_ref_translates_overlay_name_only() {
        assert_eq!(
            resolve_ref("Gemma-4-26B-A4B-it-Q4_K_M"),
            Some("unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf")
        );
        assert_eq!(resolve_ref("GLM-4.7-Flash-Q4_K_M"), None);
    }
}
