// @ts-check
import { Link } from 'react-router-dom';

/**
 * Reusable F16 legal-document layout: brand topnav, title, "last updated", a persistent
 * DRAFT banner, and structured sections. Public/unauthenticated.
 * @param {{ title: string, lastUpdated: string, sections: { heading: string, body: string }[] }} props
 */
export function LegalPage({ title, lastUpdated, sections }) {
  return (
    <>
      <header className="topnav">
        <div className="topnav__inner container">
          <Link to="/" className="brand">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 760, padding: 'var(--sp-6) var(--sp-4) 80px' }}>
        <div
          role="note"
          style={{
            border: '1px solid var(--color-warning)',
            background: 'var(--color-warning-bg)',
            color: 'var(--color-warning)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-3) var(--sp-4)',
            marginBottom: 'var(--sp-5)',
            fontWeight: 600,
          }}
        >
          DRAFT — pending legal review. This placeholder content is not final and does not
          constitute legal advice. Final lawyer-reviewed copy replaces it before launch.
        </div>
        <h1>{title}</h1>
        <p className="muted">Last updated: {lastUpdated}</p>
        {sections.map((s) => (
          <section key={s.heading} style={{ marginTop: 'var(--sp-5)' }}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </main>
    </>
  );
}
