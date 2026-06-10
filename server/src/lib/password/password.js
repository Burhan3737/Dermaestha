// @ts-check
// argon2id per CONFIG.md §5. If the argon2 native build ever fails on this host, swap the two
// calls below for bcryptjs (bcryptjs.hash / bcryptjs.compare) — accepted fallback (CONFIG.md §5).
import argon2 from 'argon2';

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** @param {string} plain */
export const hashPassword = (plain) => argon2.hash(plain, OPTS);
/** @param {string} hash @param {string} plain */
export const verifyPassword = (hash, plain) => argon2.verify(hash, plain);
