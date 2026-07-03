// Theme preference: dark (the shipped default), light, or follow the OS.
// Applied as a `dark`/`light` class on <html> — every color token in
// styles.css is a CSS custom property, so the class swap re-themes the app.
// index.html carries a tiny pre-paint copy of this logic to avoid a flash.

import { useSyncExternalStore } from 'react'

export type ThemePref = 'dark' | 'light' | 'system'

const KEY = 'mesh-theme'

let pref: ThemePref = 'dark'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-color-scheme: light)')

function resolve(p: ThemePref): 'dark' | 'light' {
  return p === 'system' ? (media.matches ? 'light' : 'dark') : p
}

function apply() {
  const resolved = resolve(pref)
  document.documentElement.classList.toggle('light', resolved === 'light')
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  listeners.forEach((l) => l())
}

/** Read the stored preference and start following OS changes. Call once,
 *  before the first render. */
export function initTheme() {
  const stored = localStorage.getItem(KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'system') pref = stored
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
export function useResolvedTheme(): 'dark' | 'light' {
  return useSyncExternalStore(subscribe, () => resolve(pref))
}
