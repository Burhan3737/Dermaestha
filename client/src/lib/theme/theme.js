// @ts-check
//
// Client-only theme runtime for Dermestha. STYLE/THEME ONLY — no API, no business
// logic. A theme is a palette of CSS custom properties declared in styles/themes.css
// under a `:root[data-theme="<id>"]` block. Switching a theme = setting the
// `data-theme` attribute on <html> and remembering the choice in localStorage.
//
// There is intentionally NO server round-trip here: a globally-enforced, admin-owned
// theme would require a backend setting (API + DB + config), which is out of scope for
// a client-side, style-only change. Persistence is therefore per-browser. The admin
// "Appearance" tab writes the same localStorage key through setTheme().

/** localStorage key holding the selected theme id. */
export const STORAGE_KEY = 'dermestha.theme';

/**
 * Theme applied when the visitor has no saved preference.
 * KEEP IN SYNC with the inline bootstrap in `client/index.html`, which must run before
 * first paint to avoid a flash of the wrong theme.
 */
export const DEFAULT_THEME = 'spruce';

/**
 * Selectable themes. `id` must match a `:root[data-theme="<id>"]` block in themes.css
 * — except `spruce`, which is the base `:root` palette (tokens.css) and needs no block.
 * `swatches` feed the admin Appearance preview only; they are not used for rendering.
 * @typedef {{ id: string, label: string, tagline: string, swatches: string[] }} ThemeMeta
 * @type {ThemeMeta[]}
 */
export const THEMES = [
  {
    id: 'spruce',
    label: 'Spruce',
    tagline: 'The original deep-green apothecary identity.',
    swatches: ['#0F3A2A', '#B5852F', '#E8ECE9', '#FFFFFF', '#0A2C20'],
  },
  // New theme palettes are appended here once the design exploration finalizes.
];

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The id of the currently-applied theme (falls back to DEFAULT_THEME). */
export function getActiveTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
}

/** Apply a theme to <html> for this page only (no persistence) — used for live preview. */
export function applyTheme(id) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', id);
  }
}

/** Apply AND remember a theme as the visitor's preference. */
export function setTheme(id) {
  applyTheme(id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable (e.g. private mode) — the theme still applies for this session */
  }
}

/** Resolve the saved (or default) theme and apply it. Call once at startup. */
export function initTheme() {
  applyTheme(readStored() || DEFAULT_THEME);
}

/** Is `id` a known, selectable theme? */
export function isKnownTheme(id) {
  return THEMES.some((t) => t.id === id);
}
