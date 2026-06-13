import { describe, it, expect, afterAll } from 'vitest';
import { ensureSettings } from './ensureSettings.js';
import { prisma } from '../prisma/prisma.js';

describe('ensureSettings', () => {
  it('is idempotent — two calls leave exactly one settings row (id=1)', async () => {
    await ensureSettings();
    await ensureSettings();
    const count = await prisma.settings.count();
    const row = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(count).toBe(1);
    expect(row?.id).toBe(1);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
