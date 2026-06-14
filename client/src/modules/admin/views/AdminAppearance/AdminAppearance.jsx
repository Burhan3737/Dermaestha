// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { THEMES, getActiveTheme, setTheme } from '../../../../lib/theme/theme.js';

/**
 * A-06 Appearance — scoped admin theme switcher. STYLE ONLY: selecting a theme sets the
 * `data-theme` attribute on <html> (re-colouring every screen instantly) and remembers
 * the choice in this browser via localStorage. No API call, no server state, no flow change.
 */
export function AdminAppearance() {
  const [active, setActive] = useState(getActiveTheme());

  function choose(id) {
    setTheme(id);
    setActive(id);
  }

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Appearance</h1>
      <p className="muted" style={{ marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-5)', maxWidth: 660 }}>
        Choose the visual theme for Dermestha. The change applies instantly across every screen and is
        remembered in this browser — only colours, typography and shape change, never the layout or content.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-8)',
        }}
      >
        {THEMES.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              className="section-card"
              style={{
                marginBottom: 0,
                outline: isActive ? '2px solid var(--color-primary)' : '0',
                outlineOffset: 2,
              }}
            >
              <div className="between" style={{ marginBottom: 'var(--sp-3)' }}>
                <span className="h3">{t.label}</span>
                {isActive && <span className="badge badge--success">Active</span>}
              </div>

              <div
                style={{
                  display: 'flex',
                  height: 44,
                  borderRadius: 'var(--r-md)',
                  overflow: 'hidden',
                  border: 'var(--border-1)',
                  marginBottom: 'var(--sp-3)',
                }}
              >
                {t.swatches.map((c, i) => (
                  <span key={i} title={c} style={{ background: c, flex: 1 }} />
                ))}
              </div>

              <p className="caption" style={{ minHeight: 34, marginBottom: 'var(--sp-4)' }}>
                {t.tagline}
              </p>

              <button
                type="button"
                className={`btn ${isActive ? 'btn--secondary' : 'btn--primary'} btn--block`}
                onClick={() => choose(t.id)}
                disabled={isActive}
              >
                {isActive ? 'Currently active' : 'Apply theme'}
              </button>
            </div>
          );
        })}
      </div>

      <h2 style={{ marginBottom: 'var(--sp-4)' }}>Live preview</h2>
      <div className="section-card">
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
          <button className="btn btn--primary">Primary</button>
          <button className="btn btn--secondary">Secondary</button>
          <button className="btn btn--ghost">Ghost</button>
          <button className="btn btn--brass">Brass</button>
          <button className="btn btn--danger">Danger</button>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
          <span className="badge badge--success">Confirmed</span>
          <span className="badge badge--info">In progress</span>
          <span className="badge badge--warning">Awaiting</span>
          <span className="badge badge--danger">Cancelled</span>
          <span className="badge badge--neutral">Neutral</span>
        </div>

        <div className="alert alert--info" style={{ marginBottom: 'var(--sp-4)' }}>
          This is how informational messages read in the selected theme.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-4)' }}>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
              <span className="avatar avatar--md">AK</span>
              <div className="col" style={{ gap: 2 }}>
                <span className="doc-card__name">Dr. Ayesha Khan</span>
                <span className="doc-card__spec">Dermatologist · 8 yrs</span>
              </div>
            </div>
            <div className="doc-card__foot">
              <span className="doc-card__fee tnum">Rs 2,500</span>
              <span className="doc-card__slot tnum">Next: 4:30 PM</span>
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <label className="field" style={{ maxWidth: 'none' }}>
              <span style={{ display: 'block', marginBottom: 'var(--sp-1)', fontWeight: 700, fontFamily: 'var(--font-head)', fontSize: 'var(--fs-caption)' }}>
                Email
              </span>
              <input className="input" defaultValue="patient@example.com" readOnly />
            </label>
            <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
              <span className="slot slot--selected">4:30 PM</span>
              <span className="slot">5:00 PM</span>
              <span className="slot slot--disabled">5:30 PM</span>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
