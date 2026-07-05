import { describe, it, expect, vi, beforeEach } from 'vitest';

// argon2 hashing is slow and irrelevant to the idempotency logic under test.
vi.mock('argon2', () => ({
  default: { hash: vi.fn(async () => 'hashed'), argon2id: 2 },
}));

import { ensureRoleUser } from '../../../../prisma/scripts/bootstrap-admin.js';

const makeClient = (existing) => ({
  user: {
    findFirst: vi.fn(async () => existing),
    create: vi.fn(async ({ data }) => ({ id: 'x', ...data })),
  },
});

beforeEach(() => vi.clearAllMocks());

describe('ensureRoleUser', () => {
  it('creates a user when none of that role exists', async () => {
    const client = makeClient(null);
    const out = await ensureRoleUser({
      prisma: client,
      role: 'superadmin',
      email: 'sa@x.com',
      password: 'p',
      fullName: 'SA',
    });
    expect(out).toBe('created');
    expect(client.user.create).toHaveBeenCalledOnce();
    expect(client.user.create.mock.calls[0][0].data.role).toBe('superadmin');
  });

  it('is a no-op when a user of that role already exists', async () => {
    const client = makeClient({ id: 'exists' });
    const out = await ensureRoleUser({
      prisma: client,
      role: 'admin',
      email: 'a@x.com',
      password: 'p',
      fullName: 'A',
    });
    expect(out).toBe('skipped');
    expect(client.user.create).not.toHaveBeenCalled();
  });
});
