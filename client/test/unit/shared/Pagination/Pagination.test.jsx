import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '#src/shared/Pagination/Pagination.jsx';

describe('Pagination', () => {
  it('Next advances a middle page; Previous goes back', () => {
    const onPage = vi.fn();
    render(<Pagination page={{ number: 2, size: 20, total: 45 }} onPage={onPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('bounds: page 1 disables Previous; empty result set shows Page 1 of 1 with both disabled', () => {
    const onPage = vi.fn();
    const { rerender } = render(
      <Pagination page={{ number: 1, size: 20, total: 45 }} onPage={onPage} />,
    );
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true);
    rerender(<Pagination page={{ number: 1, size: 20, total: 0 }} onPage={onPage} />);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
  });
});
