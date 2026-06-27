import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CancelModal } from '#src/modules/appointment/components/CancelModal/CancelModal.jsx';

beforeEach(() => vi.clearAllMocks());

describe('P-10 CancelModal (no refunds)', () => {
  it('shows a plain confirmation with no refund amounts', () => {
    render(<CancelModal onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/this cannot be undone/i)).toBeTruthy();
    expect(screen.queryByText(/refund/i)).toBeNull();
    expect(screen.queryByText(/Rs/)).toBeNull();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<CancelModal onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel appointment/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when "Keep appointment" is clicked', () => {
    const onClose = vi.fn();
    render(<CancelModal onConfirm={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /keep appointment/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
