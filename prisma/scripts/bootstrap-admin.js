// @ts-check
// One-off admin + superadmin creation (DA4). Run once on first deploy; rotate passwords immediately after.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node prisma/scripts/bootstrap-admin.js
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const hash = (password) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * Idempotently ensure a user of `role` exists. Skips if one already does.
 * @param {{ prisma: any, role: string, email: string, password: string, fullName: string }} args
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureRoleUser({ prisma, role, email, password, fullName }) {
  const existing = await prisma.user.findFirst({ where: { role } });
  if (existing) {
    console.log(`${role} already exists — no-op.`);
    return 'skipped';
  }
  const passwordHash = await hash(password);
  const user = await prisma.user.create({ data: { role, email, passwordHash, fullName } });
  console.log(`${role} created: ${user.email}. Rotate this password now.`);
  return 'created';
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const saEmail = process.env.SUPERADMIN_EMAIL;
  const saPassword = process.env.SUPERADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD'); process.exit(1); }
  if (!saEmail || !saPassword) { console.error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD'); process.exit(1); }

  const prisma = new PrismaClient();
  try {
    await ensureRoleUser({ prisma, role: 'admin', email: adminEmail, password: adminPassword, fullName: 'Dermestha Admin' });
    await ensureRoleUser({ prisma, role: 'superadmin', email: saEmail, password: saPassword, fullName: 'Dermestha Superadmin' });
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bootstrap-admin.js')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
