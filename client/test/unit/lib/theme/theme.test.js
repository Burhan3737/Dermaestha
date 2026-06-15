import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY,
  DEFAULT_THEME,
  THEMES,
  setTheme,
  applyTheme,
  getActiveTheme,
  initTheme,
  isKnownTheme,
} from '#src/lib/theme/theme.js';

describe('theme runtime (F17 — Appearance)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('registry includes the live default + the spruce fallback, each with admin-preview fields', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain(DEFAULT_THEME);
    expect(ids).toContain('spruce');
    for (const t of THEMES) {
      expect(t).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        tagline: expect.any(String),
      });
      expect(Array.isArray(t.swatches)).toBe(true);
    }
  });

  it('setTheme applies data-theme on <html> AND persists to localStorage', () => {
    setTheme('derma-noir');
    expect(document.documentElement.getAttribute('data-theme')).toBe('derma-noir');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('derma-noir');
    expect(getActiveTheme()).toBe('derma-noir');
  });

  it('applyTheme switches the theme WITHOUT persisting (preview only)', () => {
    applyTheme('sage-blush');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sage-blush');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
  });

  it('initTheme applies a stored preference when present', () => {
    localStorage.setItem(STORAGE_KEY, 'sage-blush');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('sage-blush');
  });

  it('initTheme falls back to DEFAULT_THEME with no stored preference', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe(DEFAULT_THEME);
  });

  it('isKnownTheme distinguishes registered themes from unknown ids', () => {
    expect(isKnownTheme(DEFAULT_THEME)).toBe(true);
    expect(isKnownTheme('not-a-theme')).toBe(false);
  });
});
