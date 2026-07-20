import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('#src/context/session/session.jsx', () => ({
  useSession: () => ({ session: { role: 'superadmin' } }),
}));

vi.mock('#src/lib/apiClient/apiClient.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '#src/lib/apiClient/apiClient.js';
import { Patches } from '#src/modules/patch/views/Patches/Patches.jsx';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Patches />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PATCH = {
  id: '001-example-noop',
  description: 'Example no-op.',
  repeatable: true,
  checksum: 'abc',
  status: 'never_run',
  drift: false,
  lastExecution: null,
  executions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ patches: [PATCH] });
  api.post.mockResolvedValue({ executionId: 'e1', status: 'running' });
});

describe('Patches view', () => {
  it('lists available patches with their status', async () => {
    renderView();
    expect(await screen.findByText('001-example-noop')).toBeTruthy();
    expect(screen.getByText('Never run')).toBeTruthy();
  });

  it('Run opens a confirm dialog then POSTs to the run endpoint', async () => {
    renderView();
    await screen.findByText('001-example-noop');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(api.post).not.toHaveBeenCalled(); // confirm gate first
    fireEvent.click(screen.getByRole('button', { name: 'Run patch' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/patches/001-example-noop/run'));
  });

  it('History reveals prior executions', async () => {
    api.get.mockResolvedValue({
      patches: [{
        ...PATCH,
        status: 'failed',
        lastExecution: { id: 'e0', status: 'failed', startedAt: '2026-07-05T10:00:00Z', finishedAt: '2026-07-05T10:00:01Z', error: 'boom' },
        executions: [{ id: 'e0', status: 'failed', startedAt: '2026-07-05T10:00:00Z', finishedAt: '2026-07-05T10:00:01Z', error: 'boom', result: null }],
      }],
    });
    renderView();
    await screen.findByText('001-example-noop');
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
