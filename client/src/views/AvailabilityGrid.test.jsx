import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvailabilityGrid } from './AvailabilityGrid.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({
  useSession: () => ({ session: { doctorId: 'doc1', role: 'doctor' } }),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AvailabilityGrid />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('D-03 Availability grid', () => {
  it('loads existing blocks and saves an edit via PUT', async () => {
    api.get.mockResolvedValue({ blocks: [{ weekday: 1, startTime: '18:00', endTime: '21:00' }] });
    api.put.mockResolvedValue({ blocks: [] });
    setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/availability',
        expect.objectContaining({ blocks: expect.any(Array) }),
      ),
    );
  });
});
