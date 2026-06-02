// @ts-check
export function Card({ className = '', children, ...props }) {
  return <div className={`card ${className}`.trim()} {...props}>{children}</div>;
}
export function SectionCard({ title, children }) {
  return (
    <section className="section-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
