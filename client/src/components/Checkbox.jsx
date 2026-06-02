// @ts-check
export function Checkbox({ label, id, ...props }) {
  return (
    <label className="choice" htmlFor={id}>
      <input type="checkbox" id={id} {...props} />
      <span>{label}</span>
    </label>
  );
}
