// @ts-check
// Example patch (safe no-op). Copy this shape for real patches.
// DATA/DML remediation ONLY — schema DDL belongs in Prisma migrations (ADR-46).
export const id = '001-example-noop';
export const description = 'Example no-op: verifies DB connectivity inside a transaction, changes nothing.';
export const repeatable = true; // safe to re-run

/** @param {import('@prisma/client').Prisma.TransactionClient} tx */
export async function up(tx) {
  const rows = await tx.$queryRaw`SELECT 1 AS ok`;
  return { rowsAffected: 0, note: `connectivity ok (${rows.length} row)` };
}
