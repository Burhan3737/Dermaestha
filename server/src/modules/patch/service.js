// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';
import { loadPatches, loadPatch } from './loader.js';

/** A `running` row older than this is shown as `interrupted` (server crashed/redeployed mid-run). */
const STALE_MS = 10 * 60 * 1000;

/** @param {{ status:string, startedAt:string|Date }|null} latest */
function deriveStatus(latest) {
  if (!latest) return 'never_run';
  if (latest.status === 'running') {
    return Date.now() - new Date(latest.startedAt).getTime() > STALE_MS ? 'interrupted' : 'running';
  }
  return latest.status; // 'success' | 'failed'
}

/** List every available patch file joined with its execution history + derived status/drift. */
export async function list(client = prisma) {
  const [patches, rows] = await Promise.all([
    loadPatches(),
    client.patchExecution.findMany({ orderBy: { startedAt: 'desc' } }),
  ]);
  return patches.map((p) => {
    const executions = rows.filter((r) => r.patchId === p.id).slice(0, 10);
    const latest = executions[0] ?? null;
    const lastSuccess = executions.find((r) => r.status === 'success') ?? null;
    return {
      id: p.id,
      description: p.description,
      repeatable: p.repeatable,
      checksum: p.checksum,
      status: deriveStatus(latest),
      drift: Boolean(lastSuccess && lastSuccess.checksum !== p.checksum),
      lastExecution: latest,
      executions,
    };
  });
}

/**
 * Validate + start a patch run. Inserts a `running` ledger row and kicks off the patch WITHOUT
 * awaiting it (non-blocking). Returns as soon as the row exists.
 * @param {{ patchId:string, userId:string }} args
 */
export async function run({ patchId, userId }, client = prisma) {
  const patch = await loadPatch(patchId);
  if (!patch) throw new AppError('PATCH_NOT_FOUND', 'Unknown patch.', 404);

  const existing = await client.patchExecution.findMany({ where: { patchId } });
  if (existing.some((e) => e.status === 'running')) {
    throw new AppError('PATCH_ALREADY_RUNNING', 'This patch is already running.', 409);
  }
  if (!patch.repeatable && existing.some((e) => e.status === 'success')) {
    throw new AppError('PATCH_ALREADY_APPLIED', 'This patch has already been applied.', 409);
  }

  let execution;
  try {
    execution = await client.patchExecution.create({
      data: { patchId, checksum: patch.checksum, status: 'running', executedBy: userId },
    });
  } catch (e) {
    // The partial unique index `uniq_running_patch` (patch_id WHERE status='running') closes the
    // check-then-insert race above: a second concurrent run loses the insert here → 409, not a 2nd run.
    if (e?.code === 'P2002') {
      throw new AppError('PATCH_ALREADY_RUNNING', 'This patch is already running.', 409);
    }
    throw e;
  }

  // Fire-and-track: NOT awaited. Errors are fully handled inside runPatch — a failing patch must
  // never block the response or crash the process.
  runPatch({ patch, executionId: execution.id, userId }, client).catch(() => {});

  return { executionId: execution.id, status: 'running' };
}

/**
 * Background runner: execute the patch in a transaction and finalize the ledger row. NEVER throws.
 * @param {{ patch:{ id:string, checksum:string, up:Function }, executionId:string, userId:string }} args
 */
export async function runPatch({ patch, executionId, userId }, client = prisma) {
  try {
    const result = await client.$transaction((tx) => patch.up(tx));
    await client.patchExecution.update({
      where: { id: executionId },
      data: { status: 'success', result: result ?? undefined, finishedAt: new Date() },
    });
    await audit.record({
      eventType: 'patch_run', actorType: 'admin', actorId: userId,
      meta: { patchId: patch.id, checksum: patch.checksum, executionId, status: 'success' },
    }).catch(() => {}); // an audit-write failure must NOT flip a committed `success` row to `failed`.
  } catch (e) {
    await client.patchExecution.update({
      where: { id: executionId },
      data: { status: 'failed', error: String(e?.message ?? e).slice(0, 1000), finishedAt: new Date() },
    }).catch(() => {});
    await audit.record({
      eventType: 'patch_run', actorType: 'admin', actorId: userId,
      meta: { patchId: patch.id, checksum: patch.checksum, executionId, status: 'failed' },
    }).catch(() => {});
  }
}
