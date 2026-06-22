import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorToday } from '#src/modules/doctor/views/DoctorToday/DoctorToday.jsx';
import { api } from '#src/lib/apiClient/apiClient.js';

vi.mock('#src/lib/apiClient/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'doctor' }, logout: vi.fn() }),
}));
vi.mock('#src/lib/analytics/track.js', () => ({ track: vi.fn() }));
import { track } from '#src/lib/analytics/track.js';

/**
 * Returns an ISO string for HH:MM on the current Karachi calendar day, offset
 * by `plusMs` milliseconds. Using noon (12:00 PKT) as the anchor keeps the
 * slot safely within the same calendar day regardless of when the test runs.
 */
function karachiNoonMs() {
  const todayKarachi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
    new Date(),
  );
  // todayKarachi is "YYYY-MM-DD"; noon PKT = UTC+5, so noon PKT = 07:00 UTC
  return new Date(`${todayKarachi}T07:00:00.000Z`).getTime();
}

function setup(route = '/doctor') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <DoctorToday />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('D-02 DoctorToday', () => {
  it('renders no in-page Today/History tabs — navigation is sidebar-only', async () => {
    api.get.mockResolvedValue({ data: [] });
    setup('/doctor');
    await waitFor(() => expect(screen.getByRole('heading', { name: /today/i })).toBeTruthy());
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: /^today$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^history$/i })).toBeNull();
  });

  it('lists today appointments with the patient name', async () => {
    const noon = karachiNoonMs();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: new Date(noon).toISOString(),
          slotEnd: new Date(noon + 18e5).toISOString(),
          state: 'confirmed',
          forSelf: false,
          subjectName: 'Child',
          patientName: 'Parent P',
        },
      ],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    expect(screen.getByText(/for: Child/i)).toBeTruthy();
  });

  it('opens the doctor cancel modal and posts a reason', async () => {
    const noon = karachiNoonMs();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: new Date(noon).toISOString(),
          slotEnd: new Date(noon + 18e5).toISOString(),
          state: 'confirmed',
          forSelf: true,
          subjectName: null,
          patientName: 'Parent P',
        },
      ],
    });
    api.post.mockResolvedValue({ state: 'doctor_cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Unwell' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Unwell' }),
    );
  });

  it('routes the active Join Call straight into the call and emits video_join_attempt', async () => {
    const noon = karachiNoonMs();
    const start = new Date(Date.now() + 5 * 60 * 1000); // inside the 10-min window
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a1',
          slotStart: start.toISOString(),
          slotEnd: new Date(start.getTime() + 18e5).toISOString(),
          state: 'confirmed',
          forSelf: true,
          subjectName: null,
          patientName: 'Parent P',
        },
      ],
    });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    const join = screen.getByRole('link', { name: /join call/i });
    expect(join.getAttribute('href')).toBe('/video/a1');
    join.click();
    expect(track).toHaveBeenCalledWith('video_join_attempt', {
      appointmentId: 'a1',
      role: 'doctor',
    });
  });

  it('the /doctor/history route shows history and requests the history scope', async () => {
    api.get.mockImplementation((path) =>
      path.includes('scope=history')
        ? Promise.resolve({
            data: [
              {
                id: 'h1',
                slotStart: new Date(Date.now() - 9e7).toISOString(),
                slotEnd: new Date(Date.now() - 9e7).toISOString(),
                state: 'completed',
                forSelf: true,
                subjectName: null,
                patientName: 'Past P',
              },
            ],
          })
        : Promise.resolve({ data: [] }),
    );
    setup('/doctor/history');
    await waitFor(() => expect(screen.getByText('Past P')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/appointments?scope=history');
  });

  it('history: completed row gets Write prescription + Awaiting badge after 12h', async () => {
    const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a-old',
          slotStart: old,
          slotEnd: old,
          state: 'completed',
          forSelf: true,
          subjectName: null,
          patientName: 'P One',
          hasPrescription: false,
        },
        {
          id: 'a-done',
          slotStart: old,
          slotEnd: old,
          state: 'prescription_issued',
          forSelf: true,
          subjectName: null,
          patientName: 'P Two',
          hasPrescription: true,
        },
      ],
    });
    setup('/doctor/history');
    await waitFor(() => expect(screen.getByText('P One')).toBeTruthy());
    const links = screen.getAllByRole('link', { name: /write prescription/i });
    expect(links).toHaveLength(2); // completed AND prescription_issued (corrections)
    expect(links[0].getAttribute('href')).toContain('/doctor/appointments/a-old/prescribe');
    expect(screen.getAllByText(/awaiting prescription/i)).toHaveLength(1); // only the unprescribed one
  });

  it('history: renders friendly state labels, not raw enums (ISSUE-9)', async () => {
    const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'h2',
          slotStart: old,
          slotEnd: old,
          state: 'cancelled_refunded',
          forSelf: true,
          subjectName: null,
          patientName: 'Past Q',
        },
      ],
    });
    setup('/doctor/history');
    await waitFor(() => expect(screen.getByText('Past Q')).toBeTruthy());
    expect(screen.getByText('Cancelled — refunded')).toBeTruthy();
    expect(screen.queryByText('cancelled_refunded')).toBeNull();
  });

  it('history: completed row <12h old shows no Awaiting badge', async () => {
    const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    api.get.mockResolvedValue({
      data: [
        {
          id: 'a-new',
          slotStart: recent,
          slotEnd: recent,
          state: 'completed',
          forSelf: true,
          subjectName: null,
          patientName: 'P New',
          hasPrescription: false,
        },
      ],
    });
    setup('/doctor/history');
    await waitFor(() => expect(screen.getByText('P New')).toBeTruthy());
    expect(screen.queryByText(/awaiting prescription/i)).toBeNull();
  });
});
