// @ts-check
// Split-auth chrome for P-04 / P-05 / D-01. Classes map to components.css `.auth-split` block.
export function AuthSplitLayout({ headline = 'Skin care, simplified.', children }) {
  return (
    <div className="auth-split">
      <aside className="auth-panel">
        <div className="auth-panel__top">
          <span className="auth-panel__mark" />
          <span className="auth-panel__word">Dermestha</span>
        </div>
        <h1 className="auth-panel__headline">{headline}</h1>
        <p className="auth-panel__foot">Dermatology consultations, simplified.</p>
      </aside>
      <main className="auth-form-side">
        <div className="auth-form">
          <div className="auth-brand-mobile">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
