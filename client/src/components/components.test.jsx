import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button.jsx';
import { Field } from './Field.jsx';

describe('shared components', () => {
  it('Button applies variant + disables while loading', () => {
    render(<Button variant="primary" isLoading>Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('btn--primary');
    expect(btn.disabled).toBe(true);
  });
  it('Field shows error text with the error modifier', () => {
    render(<Field id="email" label="Email" error="Required" />);
    expect(screen.getByText('Required').className).toContain('error-text');
    expect(document.querySelector('.input--error')).toBeTruthy();
  });
});
