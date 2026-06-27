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
  // Keep the lead time at its floor (30 min per F14.01) so near-term day-picker slots stay bookable.
  // Seed the clinic bank details so the patient PaymentInstructions screen renders real values
  // (manual-payment pivot §7.1 — bank fields come from the single admin-editable Settings row).
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      minBookingLeadMinutes: 30,
      bankName: 'E2E Test Bank',
      bankAccountName: 'Dermestha Clinic',
      bankAccountNumber: 'E2E-ACCT-0001',
      bankInstructions: 'Transfer the exact amount and enter your bank reference below.',
    },
  });
  await resetE2eData();
  const ids = await seedAll();
  writeFileSync(path.join(__dirname, '.seed-ids.json'), JSON.stringify(ids, null, 2));
  await prisma.$disconnect();
}
