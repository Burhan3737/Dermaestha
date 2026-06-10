import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field.jsx';

describe('Field', () => {
  it('shows error text with the error modifier', () => {
    render(<Field id="email" label="Email" error="Required" />);
    expect(screen.getByText('Required').className).toContain('error-text');
    expect(document.querySelector('.input--error')).toBeTruthy();
  });
});
