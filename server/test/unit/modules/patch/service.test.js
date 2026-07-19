import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/patch/loader.js', () => ({
  loadPatches: vi.fn(),
  loadPatch: vi.fn(),
}));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { loadPatches, loadPatch } from '#src/modules/patch/loader.js';
import * as audit from '#src/services/audit/audit.service.js';
import * as service from '#src/modules/patch/service.js';

const fakeClient = () => ({
  patchExecution: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(async ({ data }) => ({ id: 'exec1', ...data })),
    update: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (cb) => cb({})),
});

beforeEach(() => vi.clearAllMocks());

describe('patch service — run guards', () => {
  it('throws 404 for an unknown patch', async () => {
    loadPatch.mockResolvedValue(null);
    await expect(service.run({ patchId: 'x', userId: 'sa1' }, fakeClient())).rejects.toMatchObject({ status: 404 });
  });

  it('throws 409 PATCH_ALREADY_APPLIED for a non-repeatable patch with a prior success', async () => {
    loadPatch.mockResolvedValue({ id: 'p', repeatable: false, checksum: 'c', up: vi.fn() });
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([{ status: 'success' }]);
    await expect(service.run({ patchId: 'p', userId: 'sa1' }, client)).rejects.toMatchObject({ code: 'PATCH_ALREADY_APPLIED', status: 409 });
  });

  it('throws 409 PATCH_ALREADY_RUNNING when a run is in flight', async () => {
    loadPatch.mockResolvedValue({ id: 'p', repeatable: true, checksum: 'c', up: vi.fn() });
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([{ status: 'running' }]);
    await expect(service.run({ patchId: 'p', userId: 'sa1' }, client)).rejects.toMatchObject({ code: 'PATCH_ALREADY_RUNNING', status: 409 });
  });

  it('creates a running row and returns immediately (does not await up)', async () => {
    let resolved = false;
    const up = vi.fn(() => new Promise((r) => setTimeout(() => { resolved = true; r({ rowsAffected: 1 }); }, 50)));
    loadPatch.mockResolvedValue({ id: 'p', repeatable: true, checksum: 'c', up });
    const client = fakeClient();
    const out = await service.run({ patchId: 'p', userId: 'sa1' }, client);
    expect(out).toEqual({ executionId: 'exec1', status: 'running' });
    expect(client.patchExecution.create).toHaveBeenCalledWith({
      data: { patchId: 'p', checksum: 'c', status: 'running', executedBy: 'sa1' },
    });
    expect(resolved).toBe(false); // returned before up settled
  });

  it('maps a P2002 insert conflict (lost the running-guard race) to 409 PATCH_ALREADY_RUNNING', async () => {
    loadPatch.mockResolvedValue({ id: 'p', repeatable: true, checksum: 'c', up: vi.fn() });
    const client = fakeClient(); // findMany [] → JS pre-check passes; the DB partial index rejects the insert
    client.patchExecution.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.run({ patchId: 'p', userId: 'sa1' }, client)).rejects.toMatchObject({
      code: 'PATCH_ALREADY_RUNNING', status: 409,
    });
  });
});

describe('patch service — runPatch (background)', () => {
  it('finalizes success with the result and writes an audit row', async () => {
    const up = vi.fn().mockResolvedValue({ rowsAffected: 3 });
    const client = fakeClient();
    await service.runPatch({ patch: { id: 'p', checksum: 'c', up }, executionId: 'exec1', userId: 'sa1' }, client);
    expect(client.patchExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec1' },
      data: expect.objectContaining({ status: 'success', result: { rowsAffected: 3 } }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'patch_run', actorType: 'admin', actorId: 'sa1',
    }));
  });

  it('finalizes failed with the error message and never throws', async () => {
    const up = vi.fn().mockRejectedValue(new Error('boom'));
    const client = fakeClient();
    await expect(
      service.runPatch({ patch: { id: 'p', checksum: 'c', up }, executionId: 'exec1', userId: 'sa1' }, client),
    ).resolves.toBeUndefined();
    expect(client.patchExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec1' },
      data: expect.objectContaining({ status: 'failed', error: 'boom' }),
    }));
  });

  it('keeps status=success even if the success-path audit write throws (no flip to failed)', async () => {
    const up = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const client = fakeClient();
    audit.record.mockRejectedValueOnce(new Error('audit down'));
    await service.runPatch({ patch: { id: 'p', checksum: 'c', up }, executionId: 'exec1', userId: 'sa1' }, client);
    // Exactly one update — the success one; the audit failure must NOT trigger the catch's failed-update.
    expect(client.patchExecution.update).toHaveBeenCalledTimes(1);
    expect(client.patchExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'success' }),
    }));
  });
});

describe('patch service — list', () => {
  it('derives never_run / success + drift from the ledger', async () => {
    loadPatches.mockResolvedValue([{ id: 'p', description: 'd', repeatable: false, checksum: 'newsum', up: vi.fn() }]);
    const client = fakeClient();
    client.patchExecution.findMany.mockResolvedValue([
      { id: 'e2', patchId: 'p', status: 'success', checksum: 'oldsum', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
    ]);
    const out = await service.list(client);
    expect(out[0]).toMatchObject({ id: 'p', status: 'success', drift: true });
    expect(out[0].executions).toHaveLength(1);
  });
});
