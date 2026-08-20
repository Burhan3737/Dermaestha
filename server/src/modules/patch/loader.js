// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the shipped patches directory (repo-root/prisma/patches). */
export const PATCHES_DIR = path.resolve(__dirname, '../../../../prisma/patches');

/**
 * Discover, validate, and checksum every `.js` patch module in `dir`.
 * @param {string} [dir]
 * @returns {Promise<Array<{ id:string, description:string, repeatable:boolean, up:Function, filename:string, checksum:string }>>}
 */
export async function loadPatches(dir = PATCHES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const patches = [];
  for (const filename of files) {
    const full = path.join(dir, filename);
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    const mod = await import(pathToFileURL(full).href);
    if (typeof mod.id !== 'string' || typeof mod.description !== 'string' || typeof mod.up !== 'function') {
      throw new Error(`Invalid patch module ${filename}: must export { id:string, description:string, up:function }`);
    }
    patches.push({
      id: mod.id,
      description: mod.description,
      repeatable: mod.repeatable === true,
      up: mod.up,
      filename,
      checksum,
    });
  }
  return patches;
}

/** @param {string} id @param {string} [dir] */
export async function loadPatch(id, dir = PATCHES_DIR) {
  return (await loadPatches(dir)).find((p) => p.id === id) ?? null;
}
