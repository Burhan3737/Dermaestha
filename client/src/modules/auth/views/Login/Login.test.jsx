import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from './Login.jsx';
import { SessionProvider } from '../../../../context/session/session.jsx';
import { api } from '../../../../lib/apiClient/apiClient.js';

vi.mock('../../../../lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn().mockRejectedValue(new Error('401')), post: vi.fn() },
}));

function setup() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>patient-home</div>} />
          <Route path="/doctor" element={<div>doctor-home</div>} />
          <Route path="/doctor/change-password" element={<div>change-pw</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-05 Login', () => {
  it('routes a patient to / on success', async () => {
    api.post.mockResolvedValue({
      id: 'u1',
      role: 'patient',
      fullName: 'P',
      mustChangePassword: false,
    });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('patient-home')).toBeTruthy());
  });
  it('routes a must-change doctor to the change-password screen', async () => {
    api.post.mockResolvedValue({
      id: 'd1',
      role: 'doctor',
      fullName: 'Dr',
      mustChangePassword: true,
    });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'd@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('change-pw')).toBeTruthy());
  });
});
