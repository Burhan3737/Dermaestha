// @ts-check
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// .env is loaded by playwright.config.js (process.loadEnvFile) before this runs.
import { prisma, resetE2eData, seedAll } from './support/db.js';
import { ensureSettings } from '../server/src/lib/settings/ensureSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  await ensureSettings(prisma);
  // Widen the bookable window for the J1 same-day slot (floor is 30 minutes per F14.01).
  await prisma.settings.update({ where: { id: 1 }, data: { minBookingLeadMinutes: 30 } });
  await resetE2eData();
  const ids = await seedAll();
  writeFileSync(path.join(__dirname, '.seed-ids.json'), JSON.stringify(ids, null, 2));
  await prisma.$disconnect();
}
