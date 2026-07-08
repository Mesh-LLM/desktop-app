// Theme preference: dark (the shipped default, absolute black), light, vinyl
// (the retro-1977 sunset look from the landing page), or follow the OS.
// Applied as a `dark`/`light`/`vinyl` class on <html> — every color token in
// styles.css is a CSS custom property, so the class swap re-themes the app.
// index.html carries a tiny pre-paint copy of this logic to avoid a flash.

import { useSyncExternalStore } from 'react'

export type ThemePref = 'dark' | 'light' | 'vinyl' | 'system'
export type ResolvedTheme = 'dark' | 'light' | 'vinyl'

const KEY = 'mesh-theme'
const THEME_CLASSES: ResolvedTheme[] = ['dark', 'light', 'vinyl']

let pref: ThemePref = 'dark'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-color-scheme: light)')

function resolve(p: ThemePref): ResolvedTheme {
  return p === 'system' ? (media.matches ? 'light' : 'dark') : p
}

function apply() {
  const resolved = resolve(pref)
  for (const cls of THEME_CLASSES) {
    document.documentElement.classList.toggle(cls, resolved === cls)
  }
  listeners.forEach((l) => l())
}

/** Read the stored preference and start following OS changes. Call once,
 *  before the first render. */
export function initTheme() {
  const stored = localStorage.getItem(KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'vinyl' || stored === 'system')
    pref = stored
  media.addEventListener('change', () => {
    if (pref === 'system') apply()
  })
  apply()
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode etc. — the choice still applies for this session */
  }
  apply()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref)
}

/** The effective theme after resolving 'system' — for consumers that read
 *  colors imperatively (e.g. the canvas mesh viz). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => resolve(pref))
}
