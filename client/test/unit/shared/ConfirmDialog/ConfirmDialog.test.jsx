import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '#src/shared/ConfirmDialog/ConfirmDialog.jsx';

describe('ConfirmDialog (shared)', () => {
  it('default intent: spruce accent, primary confirm, optional title + body children', () => {
    const { container } = render(
      <ConfirmDialog title="Save?" confirmLabel="Confirm save" onConfirm={() => {}} onCancel={() => {}}>
        <p>Body text</p>
      </ConfirmDialog>,
    );
    expect(container.querySelector('.modal .modal__accent')).toBeTruthy();
    expect(container.querySelector('.modal__accent--danger')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Save?' })).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
    expect(container.querySelector('.modal__body .btn--primary')).toBeTruthy();
  });

  it('danger intent: danger accent + danger confirm button', () => {
    const { container } = render(
      <ConfirmDialog intent="danger" confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelector('.modal__accent--danger')).toBeTruthy();
    expect(container.querySelector('.modal__body .btn--danger')).toBeTruthy();
  });

  it('default cancel label, confirmDisabled blocks confirm, cancel fires', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog confirmLabel="OK" onConfirm={onConfirm} onCancel={onCancel} confirmDisabled />,
    );
    const ok = screen.getByRole('button', { name: 'OK' });
    expect(ok.disabled).toBe(true);
    fireEvent.click(ok);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); // default label
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders an error alert when error is set', () => {
    render(<ConfirmDialog confirmLabel="OK" error="Boom" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('Boom');
  });
});
