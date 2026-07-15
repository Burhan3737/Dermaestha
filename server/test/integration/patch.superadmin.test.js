import { describe, it, expect, beforeAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { hashPassword } = await import('#src/lib/password/password.js');

const app = createApp();
const uniq = (t) => `patch_${t}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeAgent(role) {
  const email = `${uniq(role)}@test.local`;
  const user = await prisma.user.create({
    data: { role, email, fullName: `Test ${role}`, passwordHash: await hashPassword('Passw0rd!') },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200);
  return { agent, userId: user.id };
}

describe('patches — superadmin-only surface', () => {
  let sa, admin;

  beforeAll(async () => {
    sa = await makeAgent('superadmin');
    admin = await makeAgent('admin');
  });

  it('superadmin lists patches incl. the shipped example', async () => {
    const res = await sa.agent.get('/api/patches');
    expect(res.status).toBe(200);
    const example = res.body.patches.find((p) => p.id === '001-example-noop');
    expect(example).toBeTruthy();
    expect(['never_run', 'success', 'running']).toContain(example.status);
  });

  it('admin is forbidden from listing (403)', async () => {
    const res = await admin.agent.get('/api/patches');
    expect(res.status).toBe(403);
  });

  it('admin is forbidden from running (403)', async () => {
    const res = await admin.agent.post('/api/patches/001-example-noop/run');
    expect(res.status).toBe(403);
  });

  it('unknown patch id returns 404', async () => {
    const res = await sa.agent.post('/api/patches/does-not-exist/run');
    expect(res.status).toBe(404);
  });

  it('superadmin runs the example patch → 202, resolves to success, ledger + audit written', async () => {
    const runRes = await sa.agent.post('/api/patches/001-example-noop/run');
    expect(runRes.status).toBe(202);
    expect(runRes.body.status).toBe('running');
    const executionId = runRes.body.executionId;

    // Poll until the background run finalizes (non-blocking model).
    let row;
    for (let i = 0; i < 25; i++) {
      row = await prisma.patchExecution.findUnique({ where: { id: executionId } });
      if (row && row.status !== 'running') break;
      await sleep(100);
    }
    expect(row.status).toBe('success');
    expect(row.executedBy).toBe(sa.userId);
    expect(row.finishedAt).not.toBeNull();

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'patch_run', actorId: sa.userId },
      orderBy: { at: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorType).toBe('admin'); // superadmin→admin coercion
  });
});
