// @ts-check
// One-off admin creation (DA4). Run once on first deploy; rotate the password immediately after.
// Usage: ADMIN_EMAIL=a@x.com ADMIN_PASSWORD=... node prisma/scripts/bootstrap-admin.js
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD'); process.exit(1); }

  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) { console.log('Admin already exists — no-op.'); return; }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const admin = await prisma.user.create({
    data: { role: 'admin', email, passwordHash, fullName: 'Dermestha Admin' },
  });
  console.log(`Admin created: ${admin.email}. Rotate this password now.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
