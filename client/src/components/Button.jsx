// @ts-check
export function Button({
  variant = 'primary',
  size,
  block,
  isLoading,
  disabled,
  className = '',
  children,
  ...props
}) {
  const cls = ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? '…' : children}
    </button>
  );
}
