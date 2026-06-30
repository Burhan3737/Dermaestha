import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoctorCancelModal } from '#src/modules/appointment/components/DoctorCancelModal/DoctorCancelModal.jsx';

beforeEach(() => vi.clearAllMocks());

describe('D-06 DoctorCancelModal', () => {
  it('matches the design-system modal: danger accent bar + padded body', () => {
    const { container } = render(<DoctorCancelModal onConfirm={() => {}} onClose={() => {}} />);
    expect(container.querySelector('.modal .modal__accent.modal__accent--danger')).toBeTruthy();
    expect(container.querySelector('.modal .modal__body')).toBeTruthy();
  });

  it('disables confirm until a reason is entered, then passes the trimmed reason', () => {
    const onConfirm = vi.fn();
    render(<DoctorCancelModal onConfirm={onConfirm} onClose={() => {}} />);
    const confirm = screen.getByRole('button', { name: /cancel appointment/i });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: '  busy  ' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('busy');
  });

  it('calls onClose when "Keep appointment" is clicked', () => {
    const onClose = vi.fn();
    render(<DoctorCancelModal onConfirm={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /keep appointment/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
