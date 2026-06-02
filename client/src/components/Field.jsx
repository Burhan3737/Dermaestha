// @ts-check
export function Field({ label, error, help, id, ...inputProps }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={`input${error ? ' input--error' : ''}`} {...inputProps} />
      {error ? (
        <div className="error-text">{error}</div>
      ) : help ? (
        <div className="help">{help}</div>
      ) : null}
    </div>
  );
}
