import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CancelModal } from '#src/modules/appointment/components/CancelModal/CancelModal.jsx';

beforeEach(() => vi.clearAllMocks());

describe('P-10 CancelModal', () => {
  it('shows the refund breakdown when a quote is provided (≥2h)', () => {
    render(
      <CancelModal
        quote={{ amountPaid: 250000, gatewayFee: 6000, refund: 244000 }}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Rs 2,440/)).toBeTruthy();
    expect(screen.getByText(/excludes the payment-gateway fee/i)).toBeTruthy();
  });

  it('shows the no-refund warning when no quote (<2h handled by absence)', () => {
    render(<CancelModal quote={null} lateNoRefund onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/no refund/i)).toBeTruthy();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <CancelModal
        quote={{ amountPaid: 250000, gatewayFee: 6000, refund: 244000 }}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
