import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DoctorCard } from '#src/modules/doctor/components/DoctorCard/DoctorCard.jsx';

describe('DoctorCard', () => {
  it('renders name, specialization, formatted fee, and next-slot', () => {
    render(
      <MemoryRouter>
        <DoctorCard
          doctor={{
            id: 'd1',
            fullName: 'Dr A',
            specialization: 'Acne',
            fee: 250000,
            photoUrl: null,
            nextAvailableSlot: '2026-06-15T13:00:00.000Z',
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dr A')).toBeTruthy();
    expect(screen.getByText('Acne')).toBeTruthy();
    expect(screen.getByText('Rs 2,500')).toBeTruthy();
  });
  it('shows a no-availability hint when nextAvailableSlot is null', () => {
    render(
      <MemoryRouter>
        <DoctorCard
          doctor={{
            id: 'd1',
            fullName: 'Dr A',
            specialization: 'Acne',
            fee: 250000,
            photoUrl: null,
            nextAvailableSlot: null,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no slots/i)).toBeTruthy();
  });
});
