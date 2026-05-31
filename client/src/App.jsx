export default function App() {
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>Dermestha</h1>
      <p style={{ color: 'var(--color-text-body)' }}>
        Foundation scaffold is live. Same-origin API + ported design tokens are wired.
      </p>
      <button className="btn btn--primary">Primary button (tokens.css)</button>
    </main>
  );
}
