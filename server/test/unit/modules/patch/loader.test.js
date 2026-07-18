import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatches, loadPatch } from '#src/modules/patch/loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const validDir = path.join(here, 'fixtures/valid');
const invalidDir = path.join(here, 'fixtures/invalid');

describe('patch loader', () => {
  it('loads a valid patch with a 64-char sha256 checksum', async () => {
    const patches = await loadPatches(validDir);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: '010-ok', description: 'Valid fixture patch.', repeatable: false });
    expect(patches[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof patches[0].up).toBe('function');
  });

  it('loadPatch finds by id and returns null for an unknown id', async () => {
    expect((await loadPatch('010-ok', validDir))?.id).toBe('010-ok');
    expect(await loadPatch('nope', validDir)).toBeNull();
  });

  it('throws on a malformed patch module', async () => {
    await expect(loadPatches(invalidDir)).rejects.toThrow(/Invalid patch module/);
  });

  it('returns [] when the directory does not exist', async () => {
    expect(await loadPatches(path.join(here, 'fixtures/missing'))).toEqual([]);
  });
});
