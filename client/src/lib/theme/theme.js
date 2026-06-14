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
export const DEFAULT_THEME = 'ivory-ink';

/**
 * Selectable themes. `id` must match a `:root[data-theme="<id>"]` block in themes.css
 * — except `spruce`, which is the base `:root` palette (tokens.css) and needs no block.
 * `swatches` feed the admin Appearance preview only; they are not used for rendering.
 * @typedef {{ id: string, label: string, tagline: string, swatches: string[] }} ThemeMeta
 * @type {ThemeMeta[]}
 */
export const THEMES = [
  {
    id: 'ivory-ink',
    label: 'Ivory & Ink',
    tagline: 'Warm bone & ink editorial luxe — a single burnt-amber accent. (Default)',
    swatches: ['#211C17', '#A8531A', '#EFE8DA', '#FBF7EF', '#211A13'],
  },
  {
    id: 'derma-noir',
    label: 'Derma Noir',
    tagline: 'Dark, immersive aubergine with jade & rose-gold — built for evening consults.',
    swatches: ['#6FD8B0', '#D9A893', '#100C16', '#281F36', '#13231D'],
  },
  {
    id: 'sage-blush',
    label: 'Sage & Blush',
    tagline: 'Calming clinical-spa — soft sage, clay-rose blush, warm greige.',
    swatches: ['#41624E', '#9E5048', '#ECE7DE', '#FBF8F3', '#243A2E'],
  },
  {
    id: 'spruce',
    label: 'Spruce',
    tagline: 'The original deep-green apothecary identity.',
    swatches: ['#0F3A2A', '#B5852F', '#E8ECE9', '#FFFFFF', '#0A2C20'],
  },
];

/**
 * Display webfonts loaded on demand when a theme becomes active. Body text stays Hanken
 * Grotesk for every theme (loaded statically in index.html) so first paint never blocks
 * on a webfont. The default theme's display face (Fraunces) and spruce's (Archivo) are
 * also loaded statically in index.html; the rest are injected here only when selected,
 * keeping the 3G payload to one display family per active theme.
 */
const THEME_FONT_HREFS = {
  'derma-noir': 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap',
  'sage-blush': 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&display=swap',
  // 'ivory-ink' (Fraunces) + 'spruce' (Archivo) are preloaded statically in index.html.
};

function ensureThemeFont(id) {
  if (typeof document === 'undefined') return;
  const href = THEME_FONT_HREFS[id];
  if (!href) return;
  if (document.querySelector(`link[data-theme-font="${id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-theme-font', id);
  document.head.appendChild(link);
}

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
    ensureThemeFont(id);
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
