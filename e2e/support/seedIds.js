// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const seedIds = JSON.parse(
  readFileSync(path.join(__dirname, '..', '.seed-ids.json'), 'utf8'),
);
