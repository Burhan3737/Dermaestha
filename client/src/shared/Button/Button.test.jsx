import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button.jsx';

describe('Button', () => {
  it('applies variant + disables while loading', () => {
    render(
      <Button variant="primary" isLoading>
        Go
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('btn--primary');
    expect(btn.disabled).toBe(true);
  });
});
