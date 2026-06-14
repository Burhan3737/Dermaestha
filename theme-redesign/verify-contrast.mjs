// Independent WCAG AA contrast verification for every Dermestha theme.
// Parses the REAL token files (no hand-copied values) and checks the critical pairs.
// Run: node theme-redesign/verify-contrast.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../client/src/styles/', import.meta.url);
const tokensCss = readFileSync(new URL('tokens.css', root), 'utf8');
const themesCss = readFileSync(new URL('themes.css', root), 'utf8');

const parseDecls = (block) => {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1].trim()] = m[2].trim();
  return out;
};

// Base :root (spruce) = all declarations in tokens.css.
const base = parseDecls(tokensCss);
// Per-theme overrides.
const themes = { spruce: { ...base } };
for (const m of themesCss.matchAll(/:root\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)) {
  themes[m[1]] = { ...base, ...parseDecls(m[2]) };
}

const hex = (c) => {
  let h = c.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [ra, rb] = [hex(a), hex(b)];
  if (!ra || !rb) return null;
  const [la, lb] = [lum(ra), lum(rb)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// pair: [label, fgToken, bgToken, threshold, exempt?]
const T_TEXT = 4.5, T_LARGE = 3.0;
const pairs = [
  ['body / bg', 'color-text-body', 'color-bg', T_TEXT],
  ['body / surface', 'color-text-body', 'color-surface', T_TEXT],
  ['strong / surface', 'color-text-strong', 'color-surface', T_TEXT],
  ['strong / bg', 'color-text-strong', 'color-bg', T_TEXT],
  ['muted / surface', 'color-text-muted', 'color-surface', T_TEXT],
  ['muted / bg', 'color-text-muted', 'color-bg', T_TEXT],
  ['on-primary / primary', 'color-on-primary', 'color-primary', T_TEXT],
  ['on-accent / accent', 'color-on-accent', 'color-accent', T_TEXT],
  ['on-danger / danger', 'color-on-danger', 'color-danger', T_TEXT],
  ['accent-deep / surface', 'color-accent-deep', 'color-surface', T_TEXT],
  ['danger-deep / surface', 'color-danger-deep', 'color-surface', T_TEXT],
  ['success / success-bg', 'color-success', 'color-success-bg', T_TEXT],
  ['info / info-bg', 'color-info', 'color-info-bg', T_TEXT],
  ['warning / warning-bg', 'color-warning', 'color-warning-bg', T_TEXT],
  ['danger / danger-bg', 'color-danger', 'color-danger-bg', T_TEXT],
  ['neutral / neutral-bg', 'color-neutral', 'color-neutral-bg', T_TEXT],
  ['on-dark / feature-bg', 'color-on-dark', 'color-feature-bg', T_TEXT],
  ['on-dark-strong / feature-bg', 'color-on-dark-strong', 'color-feature-bg', T_TEXT],
  ['on-dark-muted / feature-bg', 'color-on-dark-muted', 'color-feature-bg', T_TEXT],
  ['on-dark / dark-bg (video)', 'color-on-dark', 'color-dark-bg', T_TEXT],
  ['tab-inactive / surface', 'color-tab-inactive', 'color-surface', T_TEXT],
  // functional input/control boundary — WCAG 1.4.11 (3:1), enforced
  ['border-strong / surface (3:1)', 'color-border-strong', 'color-surface', T_LARGE],
  // decorative hairlines / elevation / disabled — reported as notes, NOT hard pass/fail
  // (primary-border is the faint available-slot outline; the slot is identified by its
  //  label + selected state, so it is not a 1.4.11 control boundary).
  ['primary-border / surface (decorative)', 'color-primary-border', 'color-surface', T_LARGE, true],
  ['surface / bg (elevation)', 'color-surface', 'color-bg', 1.18, true],
  ['disabled / surface (AA-exempt)', 'color-text-disabled', 'color-surface', T_LARGE, true],
];

// spruce is the UNMODIFIED original; its pre-existing gaps are out of scope (not regressions).
const NEW_THEMES = ['ivory-ink', 'derma-noir', 'sage-blush'];
const perTheme = {};
for (const theme of ['spruce', ...NEW_THEMES]) {
  const t = themes[theme];
  let fails = 0;
  console.log(`\n=== ${theme}${theme === 'spruce' ? '  (original / unmodified baseline)' : ''} ===`);
  for (const [label, fg, bg, thr, exempt] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r != null && r >= thr;
    const mark = ok ? 'PASS' : (exempt ? 'note' : 'FAIL');
    if (!ok && !exempt) fails++;
    console.log(`  ${mark.padEnd(4)} ${label.padEnd(36)} ${r ? r.toFixed(2) : '??'}:1  (>=${thr})`);
  }
  perTheme[theme] = fails;
}
console.log('\n--- Summary ---');
for (const [theme, f] of Object.entries(perTheme)) console.log(`  ${theme.padEnd(12)} ${f} hard failure(s)`);
const newFailures = NEW_THEMES.reduce((s, t) => s + perTheme[t], 0);
console.log(`\nNEW-THEME hard failures (gating): ${newFailures}`);
console.log(`spruce baseline failures are pre-existing (doc-06 §4 accent caveat) and out of scope.`);
process.exit(newFailures ? 1 : 0);
