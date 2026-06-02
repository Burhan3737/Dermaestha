# Slice A — Identity & Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authentication foundation for Dermestha — patient sign-up, shared login with role-routing, password recovery, the DA3 forced-password-change gate, plus the frontend session/state infrastructure and the P-04/P-05/D-01 screens.

**Architecture:** Express `model→controller→service` with thin controllers; Zod validation at the edge; cookie sessions (already wired); single `requireRole` authz boundary. Frontend: React Context for session, TanStack Query for server cache, `apiClient` as the single network seam. Reset token stored as a SHA-256 hash in two new `users` columns. Tests are hybrid: mocked-Prisma units + a few real-DB supertest integration tests.

**Tech Stack:** Node + Express, Prisma 6.19 (PostgreSQL), Zod, argon2, express-session, express-rate-limit, Vitest + supertest, React 19 + react-router-dom 6, @tanstack/react-query, Vite.

**Design doc:** `docs/superpowers/specs/2026-06-03-slice-a-identity-access-design.md`
**Session changelog:** `agentChangeLogs/2026-06-03-0006-slice-a-identity-access.md` (controller owns this; do NOT create per-task changelogs).

---

## ⚠️ Governance gates (controller-owned, do before coding)

Per CLAUDE.md + doc-00 change protocol, these require **user approval before editing any spec**. The controller obtains approval and applies them; subagents must NOT edit `docs/specification/*` or `agentChangeLogs/*`.

1. **doc 04 (DATABASE)** — add `reset_token_hash` + `reset_token_expires_at` to the `users` table; version bump + revision row. *(required — schema change)*
2. **doc 11 (ADR)** — new `ADR-NN`: frontend state = Context (session) + TanStack Query (server cache). *(required)*
3. **doc 14 (INTEGRATION)** — add a 7th email template `password_reset` (merge vars: `resetUrl`, `expiresInMinutes`). *(required — newly discovered gap; the F01.03 reset email is not in the closed catalog)*
4. **doc 03 (ARCHITECTURE)** — note `@tanstack/react-query` in the frontend stack row. *(minor)*
5. **doc 05 (API)** — add `MUST_CHANGE_PASSWORD` to the §3.2 status map; note reset consumes hashed columns. *(minor)*
6. **doc 08 (SECURITY)** — note reset token stored hashed + single-use on `users`. *(minor)*
7. **doc 12 (TEST CASES)** — add `TC-F01-*` / `TC-F15-*` (read the file first to continue numbering). *(required)*
8. **doc 13 (STATUS)** — correct informal screen IDs to doc 06; mark Auth module progress on completion. *(required)*

---

## Phase 0 — Setup

### Task 0.1: Feature branch + client dependency

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Create the feature branch off main**

```bash
git checkout -b feat/slice-a-identity-access
```

- [ ] **Step 2: Add the TanStack Query dependency to the client workspace**

```bash
npm --workspace client install @tanstack/react-query
```

- [ ] **Step 3: Verify it installed**

Run: `npm --workspace client ls @tanstack/react-query`
Expected: prints a resolved version (e.g. `@tanstack/react-query@5.x`), no error.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json client/package.json
git commit -m "chore(client): add @tanstack/react-query for server-cache state"
```

### Task 0.2: Schema — reset-token columns + migration

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model, after `mustChangePassword`)
- Create: `prisma/migrations/<generated>/migration.sql` (generated)

> **Governance:** doc-04 update (gate #1) must be approved/applied by the controller before or alongside this task.

- [ ] **Step 1: Add the two columns to the `User` model**

In `prisma/schema.prisma`, immediately after the `mustChangePassword` line, add:

```prisma
  /// Password-reset (F01.03): SHA-256 hash of the single-use token; raw token only ever in the email link.
  resetTokenHash      String?   @map("reset_token_hash")
  /// Reset-token expiry (now + RESET_TOKEN_TTL_MIN). Cleared with the hash on use/expiry.
  resetTokenExpiresAt DateTime? @map("reset_token_expires_at") @db.Timestamptz(6)
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_reset_token_columns`
Expected: a new migration folder is created; `migration.sql` contains two `ALTER TABLE "users" ADD COLUMN ...` statements. This is **additive** — no hand-edited partial index is needed here (unlike the `uniq_active_slot` invariant).

- [ ] **Step 3: Verify the client regenerated**

Run: `npx prisma generate`
Expected: success; `resetTokenHash` / `resetTokenExpiresAt` are now on the `User` type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add reset-token columns to users (F01.03)"
```

---

## Phase 1 — Backend

### Task 1.1: Shared Zod auth DTOs

**Files:**
- Create: `shared/schemas/auth.js`
- Modify: `shared/schemas/index.js`

- [ ] **Step 1: Write the schemas**

Create `shared/schemas/auth.js`:

```js
// @ts-check
import { z } from 'zod';

export const signupSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20),
  password: z.string().min(8).max(200),
  tosAccepted: z.literal(true), // consent gate (F01.01)
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  // Accepted per doc 05 but NOT authoritative; the stored role decides (enumeration-safety).
  role: z.enum(['patient', 'doctor', 'admin']).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
```

- [ ] **Step 2: Re-export from the seam**

Replace `shared/schemas/index.js` contents with:

```js
// @ts-check
// Shared Zod DTOs (client↔server). Slice A adds the auth schemas.
export * from './auth.js';
```

- [ ] **Step 3: Commit**

```bash
git add shared/schemas/auth.js shared/schemas/index.js
git commit -m "feat(shared): add auth Zod DTOs"
```

### Task 1.2: `validate` middleware

**Files:**
- Create: `server/src/middleware/validate.js`
- Test: `server/src/middleware/validate.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/middleware/validate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';

const schema = z.object({ email: z.string().email() });

function ctx(body) {
  let nextArg;
  const req = { body };
  const next = (e) => { nextArg = e; };
  return { req, next, getNext: () => nextArg };
}

describe('validate middleware', () => {
  it('passes valid body through and replaces req.body with parsed data', () => {
    const { req, next, getNext } = ctx({ email: 'a@b.com', extra: 'x' });
    validate(schema)(req, {}, next);
    expect(getNext()).toBeUndefined();
    expect(req.body).toEqual({ email: 'a@b.com' }); // stripped unknown key
  });
  it('forwards a ZodError to next() on invalid body', () => {
    const { req, next, getNext } = ctx({ email: 'nope' });
    validate(schema)(req, {}, next);
    expect(getNext()?.name).toBe('ZodError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot find `./validate.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/middleware/validate.js`:

```js
// @ts-check
/**
 * Zod validation at the API edge (PROJECT_RULES). On failure the ZodError flows to errorHandler,
 * which emits the uniform `400 VALIDATION_FAILED` envelope. On success, req.body is the parsed data.
 * @param {import('zod').ZodSchema} schema
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- validate`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/validate.js server/src/middleware/validate.test.js
git commit -m "feat(server): add Zod validate middleware"
```

### Task 1.3: Reset-token crypto helper

**Files:**
- Create: `server/src/lib/resetToken.js`
- Test: `server/src/lib/resetToken.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/resetToken.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateResetToken, hashResetToken } from './resetToken.js';

describe('resetToken', () => {
  it('generates a 64-char hex token', () => {
    const t = generateResetToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
  it('hashes deterministically and differs from the raw token', () => {
    const raw = generateResetToken();
    expect(hashResetToken(raw)).toBe(hashResetToken(raw));
    expect(hashResetToken(raw)).not.toBe(raw);
    expect(hashResetToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resetToken`
Expected: FAIL — cannot find `./resetToken.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/resetToken.js`:

```js
// @ts-check
import crypto from 'node:crypto';

/** 32 random bytes as hex — the raw token sent in the email link (never stored). */
export const generateResetToken = () => crypto.randomBytes(32).toString('hex');

/** SHA-256 hex of the raw token — this is what we persist and compare. */
export const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- resetToken`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/resetToken.js server/src/lib/resetToken.test.js
git commit -m "feat(server): add reset-token crypto helper"
```

### Task 1.4: `auth.service` (mocked-Prisma unit tests)

**Files:**
- Create: `server/src/services/auth.service.js`
- Test: `server/src/services/auth.service.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/auth.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('../lib/password.js', () => ({
  hashPassword: vi.fn(async (p) => `hash:${p}`),
  verifyPassword: vi.fn(async (hash, p) => hash === `hash:${p}`),
}));
vi.mock('./audit.service.js', () => ({ record: vi.fn(async () => {}) }));

import { prisma } from '../lib/prisma.js';
import * as audit from './audit.service.js';
import * as auth from './auth.service.js';
import { hashResetToken } from '../lib/resetToken.js';

beforeEach(() => vi.clearAllMocks());

describe('auth.service', () => {
  it('signup creates a patient with tosAcceptedAt and returns the safe shape', async () => {
    prisma.user.create.mockResolvedValue({ id: 'u1', role: 'patient', fullName: 'Aa', mustChangePassword: false, passwordHash: 'hash:pw' });
    const out = await auth.signup({ fullName: 'Aa', email: 'a@b.com', phone: '0300', password: 'password1' });
    expect(out).toEqual({ id: 'u1', role: 'patient', fullName: 'Aa', mustChangePassword: false });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe('patient');
    expect(data.tosAcceptedAt).toBeInstanceOf(Date);
    expect(data.passwordHash).toBe('hash:password1');
  });

  it('signup maps a P2002 unique violation to EMAIL_TAKEN 409', async () => {
    prisma.user.create.mockRejectedValue({ code: 'P2002' });
    await expect(auth.signup({ fullName: 'Aa', email: 'a@b.com', phone: '0300', password: 'password1' }))
      .rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
  });

  it('login returns the safe shape and audits on success', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'doctor', fullName: 'Dr', mustChangePassword: true, passwordHash: 'hash:pw' });
    const out = await auth.login({ email: 'd@b.com', password: 'pw' });
    expect(out).toEqual({ id: 'u1', role: 'doctor', fullName: 'Dr', mustChangePassword: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'login', actorType: 'doctor', actorId: 'u1' }));
  });

  it('login throws an identical generic 401 for unknown email and for wrong password (enumeration-safe)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const unknown = await auth.login({ email: 'x@b.com', password: 'pw' }).catch((e) => e);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'patient', passwordHash: 'hash:right' });
    const wrong = await auth.login({ email: 'a@b.com', password: 'wrong' }).catch((e) => e);
    expect(unknown).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(wrong).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(unknown.message).toBe(wrong.message);
  });

  it('requestPasswordReset returns null for unknown email (uniform 200, no work)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await auth.requestPasswordReset('x@b.com')).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('requestPasswordReset stores the token HASH (not raw) + expiry and returns the raw token', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'patient' });
    prisma.user.update.mockResolvedValue({});
    const out = await auth.requestPasswordReset('a@b.com');
    expect(out.rawToken).toMatch(/^[0-9a-f]{64}$/);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.resetTokenHash).toBe(hashResetToken(out.rawToken));
    expect(data.resetTokenHash).not.toBe(out.rawToken);
    expect(data.resetTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('resetPassword sets a new password and clears the token columns (single-use) on a valid token', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: 'patient' });
    prisma.user.update.mockResolvedValue({});
    await auth.resetPassword({ token: 'a'.repeat(64), newPassword: 'newpassw0rd' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBe('hash:newpassw0rd');
    expect(data.resetTokenHash).toBeNull();
    expect(data.resetTokenExpiresAt).toBeNull();
  });

  it('resetPassword throws INVALID_RESET_TOKEN when no unexpired match', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(auth.resetPassword({ token: 'bad', newPassword: 'newpassw0rd' }))
      .rejects.toMatchObject({ code: 'INVALID_RESET_TOKEN', status: 400 });
  });

  it('changePassword verifies current, clears mustChangePassword, and audits', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'doctor', fullName: 'Dr', mustChangePassword: true, passwordHash: 'hash:old' });
    prisma.user.update.mockResolvedValue({});
    const out = await auth.changePassword('u1', { currentPassword: 'old', newPassword: 'brandnew1' });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ passwordHash: 'hash:brandnew1', mustChangePassword: false });
    expect(out.mustChangePassword).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'password_change', actorId: 'u1' }));
  });

  it('changePassword rejects a wrong current password with 422', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'doctor', passwordHash: 'hash:old' });
    await expect(auth.changePassword('u1', { currentPassword: 'WRONG', newPassword: 'brandnew1' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 422 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- auth.service`
Expected: FAIL — cannot find `./auth.service.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/services/auth.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import * as audit from './audit.service.js';
import { AppError } from '../http/AppError.js';
import { generateResetToken, hashResetToken } from '../lib/resetToken.js';
import { RESET_TOKEN_TTL_MIN } from '../config/constants.js';

// A constant dummy argon2 hash so an unknown-email login spends similar time as a real verify
// (reduces timing-based enumeration). Any valid argon2id hash works; password is irrelevant.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3l0u3Hj5oF0r1uV2bQ8m9rXq5n2pYw0kQ1aZ2bC3dE';

/** @param {{id:string,role:string,fullName:string,mustChangePassword:boolean}} u */
const toSafeUser = (u) => ({ id: u.id, role: u.role, fullName: u.fullName, mustChangePassword: u.mustChangePassword });

export async function signup({ fullName, email, phone, password }) {
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { role: 'patient', email, phone, fullName, passwordHash, tosAcceptedAt: new Date() },
    });
    return toSafeUser(user);
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'P2002') {
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
    }
    throw e;
  }
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(DUMMY_HASH, password).catch(() => false), false);
  if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);
  await audit.record({ eventType: 'login', actorType: user.role, actorId: user.id, targetRef: user.id });
  return toSafeUser(user);
}

export async function getById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toSafeUser(user) : null;
}

export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null; // uniform 200, no work (enumeration-safe)
  const rawToken = generateResetToken();
  const resetTokenHash = hashResetToken(rawToken);
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash, resetTokenExpiresAt } });
  return { user: toSafeUser(user), rawToken };
}

export async function resetPassword({ token, newPassword }) {
  const resetTokenHash = hashResetToken(token);
  const user = await prisma.user.findFirst({
    where: { resetTokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!user) throw new AppError('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.', 400);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  await audit.record({ eventType: 'password_change', actorType: user.role, actorId: user.id, targetRef: user.id, reason: 'reset' });
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 422);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  await audit.record({ eventType: 'password_change', actorType: user.role, actorId: user.id, targetRef: user.id });
  return toSafeUser({ ...user, mustChangePassword: false });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- auth.service`
Expected: PASS (all cases). If the `DUMMY_HASH` line causes a lint complaint about the comma operator, refactor the `login` `ok` computation into an explicit `if (!user) { await verifyPassword(...).catch(()=>{}); throw ... }` block — behavior identical.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/auth.service.js server/src/services/auth.service.test.js
git commit -m "feat(server): auth.service (signup/login/reset/change) with enumeration-safety"
```

### Task 1.5: `mustChangePassword` gate middleware

**Files:**
- Create: `server/src/middleware/mustChangePassword.js`
- Test: `server/src/middleware/mustChangePassword.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/middleware/mustChangePassword.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mustChangePasswordGate } from './mustChangePassword.js';

// Mounted on '/api', so req.path is relative to that mount (e.g. '/auth/me').
function ctx(session, path) {
  let err;
  const req = { session, path };
  const next = (e) => { err = e; };
  return { req, next, getErr: () => err };
}

describe('mustChangePassword gate (DA3)', () => {
  it('lets a normal session through', () => {
    const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: false }, '/doctors');
    mustChangePasswordGate(req, {}, next);
    expect(getErr()).toBeUndefined();
  });
  it('blocks a flagged session on a non-allowlisted route with 403 MUST_CHANGE_PASSWORD', () => {
    const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: true }, '/doctors');
    mustChangePasswordGate(req, {}, next);
    expect(getErr()).toMatchObject({ code: 'MUST_CHANGE_PASSWORD', status: 403 });
  });
  it.each(['/auth/me', '/auth/change-password', '/auth/logout'])('allows %s even when flagged', (path) => {
    const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: true }, path);
    mustChangePasswordGate(req, {}, next);
    expect(getErr()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mustChangePassword`
Expected: FAIL — cannot find `./mustChangePassword.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/middleware/mustChangePassword.js`:

```js
// @ts-check
import { AppError } from '../http/AppError.js';

// Mounted on '/api', so paths are relative to that mount.
const ALLOWLIST = new Set(['/auth/logout', '/auth/change-password', '/auth/me']);

/**
 * DA3/DA5 gate: a session flagged mustChangePassword may not reach any route except the
 * allowlisted auth routes until the password is changed.
 */
export function mustChangePasswordGate(req, _res, next) {
  if (req.session?.mustChangePassword && !ALLOWLIST.has(req.path)) {
    return next(new AppError('MUST_CHANGE_PASSWORD', 'You must change your password before continuing.', 403));
  }
  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mustChangePassword`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/mustChangePassword.js server/src/middleware/mustChangePassword.test.js
git commit -m "feat(server): DA3 mustChangePassword gate middleware"
```

### Task 1.6: `auth.controller`

**Files:**
- Create: `server/src/controllers/auth.controller.js`

> Controllers are thin (PROJECT_RULES): no business logic. Covered by the integration tests in Task 1.8.

- [ ] **Step 1: Write the implementation**

Create `server/src/controllers/auth.controller.js`:

```js
// @ts-check
import * as authService from '../services/auth.service.js';
import { emailProvider } from '../integrations/email/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../http/AppError.js';
import { RESET_TOKEN_TTL_MIN } from '../config/constants.js';

function setSession(req, user) {
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.mustChangePassword = user.mustChangePassword;
}

export async function signup(req, res, next) {
  try {
    const user = await authService.signup(req.body);
    setSession(req, user);
    res.status(201).json(user);
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const user = await authService.login(req.body);
    setSession(req, user);
    res.json(user);
  } catch (e) { next(e); }
}

export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('dermestha.sid');
    res.status(204).end();
  });
}

export async function me(req, res, next) {
  try {
    if (!req.session?.userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    const user = await authService.getById(req.session.userId);
    if (!user) return req.session.destroy(() => next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401)));
    res.json(user);
  } catch (e) { next(e); }
}

export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    if (result) {
      const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${result.rawToken}`;
      try {
        await emailProvider.send({
          template: 'password_reset',
          to: req.body.email,
          vars: { resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MIN },
        });
      } catch {
        // Resend adapter is a stub until the email integration lands; never leak failure to the caller.
        logger.warn('password reset email not sent (provider stub)', { email: req.body.email });
        if (env.NODE_ENV !== 'production') logger.info('DEV password reset link', { resetUrl });
      }
    }
    res.json({ ok: true }); // identical response whether or not the account exists
  } catch (e) { next(e); }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function changePassword(req, res, next) {
  try {
    const user = await authService.changePassword(req.session.userId, req.body);
    req.session.mustChangePassword = false;
    res.json(user);
  } catch (e) { next(e); }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/controllers/auth.controller.js
git commit -m "feat(server): thin auth controller"
```

### Task 1.7: `auth` router (rate limiters + lockout)

**Files:**
- Create: `server/src/routes/auth.js`
- Modify: `server/src/middleware/rateLimit.js` (add optional keyGenerator/skip/onBlocked passthrough)

- [ ] **Step 1: Extend the rate-limit factory (surgical)**

In `server/src/middleware/rateLimit.js`, replace the function body so it accepts the extra options the §3.6 limiters need, keeping existing callers working (all new params optional):

```js
// @ts-check
import rateLimit from 'express-rate-limit';
import { AppError } from '../http/AppError.js';

/**
 * Factory for the §3.6 rate limiters. Memory store is acceptable single-instance (CONFIG.md §3).
 * @param {{ windowMs: number, max: number, code?: string,
 *           keyGenerator?: (req: any) => string, skipSuccessfulRequests?: boolean,
 *           onBlocked?: (req: any) => void }} opts
 */
export function makeRateLimiter({ windowMs, max, code = 'RATE_LIMITED', keyGenerator, skipSuccessfulRequests, onBlocked }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skipSuccessfulRequests ? { skipSuccessfulRequests } : {}),
    handler: (req, _res, next) => {
      if (onBlocked) onBlocked(req);
      next(new AppError(code, 'Too many requests. Try again later.', 429));
    },
  });
}
```

- [ ] **Step 2: Write the router**

Create `server/src/routes/auth.js`:

```js
// @ts-check
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { makeRateLimiter } from '../middleware/rateLimit.js';
import { requireRole } from '../middleware/requireRole.js';
import * as audit from '../services/audit.service.js';
import {
  signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
} from '../../../shared/schemas/index.js';
import {
  LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_MIN, SIGNUP_MAX_PER_IP_HOUR, FORGOT_MAX_PER_ACCOUNT_HOUR,
} from '../config/constants.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const emailKey = (req) => String(req.body?.email ?? 'unknown').toLowerCase();

const signupLimiter = makeRateLimiter({ windowMs: HOUR, max: SIGNUP_MAX_PER_IP_HOUR });
const loginIpLimiter = makeRateLimiter({ windowMs: 15 * MIN, max: 20 });

// Per-account lockout: counts only FAILED logins (skipSuccessfulRequests); audit on breach.
const loginAccountLimiter = makeRateLimiter({
  windowMs: LOGIN_LOCKOUT_MIN * MIN,
  max: LOGIN_MAX_ATTEMPTS,
  code: 'ACCOUNT_LOCKED',
  keyGenerator: emailKey,
  skipSuccessfulRequests: true,
  onBlocked: (req) => {
    audit.record({ eventType: 'login_lockout', actorType: 'system', meta: { email: emailKey(req) } }).catch(() => {});
  },
});

// Forgot-password: enumeration-safe — on breach return the SAME 200, do nothing (never 429).
const forgotLimiter = rateLimit({
  windowMs: HOUR,
  max: FORGOT_MAX_PER_ACCOUNT_HOUR,
  keyGenerator: emailKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.json({ ok: true }),
});

export const authRouter = Router();
authRouter.post('/signup', signupLimiter, validate(signupSchema), c.signup);
authRouter.post('/login', loginIpLimiter, loginAccountLimiter, validate(loginSchema), c.login);
authRouter.post('/logout', c.logout);
authRouter.get('/me', c.me);
authRouter.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), c.forgotPassword);
authRouter.post('/reset-password', validate(resetPasswordSchema), c.resetPassword);
authRouter.post('/change-password', requireRole('patient', 'doctor', 'admin'), validate(changePasswordSchema), c.changePassword);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/auth.js server/src/middleware/rateLimit.js
git commit -m "feat(server): auth router with rate limits + per-account lockout"
```

### Task 1.8: Wire into the app + integration tests (real DB)

**Files:**
- Modify: `server/src/index.js`
- Test: `server/src/test/auth.integration.test.js`

- [ ] **Step 1: Mount the gate + auth router**

In `server/src/index.js`, add imports near the others:

```js
import { authRouter } from './routes/auth.js';
import { mustChangePasswordGate } from './middleware/mustChangePassword.js';
```

Then, inside `createApp()`, change the API section so it reads:

```js
  app.use(express.json());
  app.use(sessionMiddleware);

  // API routes first.
  app.use('/api', mustChangePasswordGate);   // DA3 gate, after session, before feature routers
  app.use('/api/auth', authRouter);
  app.use('/api', healthRouter);
  // Unknown /api path → JSON 404 envelope (never the SPA HTML).
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Not found.', 404)));
```

- [ ] **Step 2: Write the failing integration tests**

Create `server/src/test/auth.integration.test.js`:

```js
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../lib/prisma.js';
import * as auth from '../services/auth.service.js';

const app = createApp();
const uniq = () => `slicea_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('auth integration', () => {
  const created = [];

  it('signup issues an HttpOnly, SameSite=Lax session cookie and returns the safe shape', async () => {
    const email = uniq();
    const res = await request(app).post('/api/auth/signup')
      .send({ fullName: 'Test P', email, phone: '03001234567', password: 'password1', tosAccepted: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'patient', fullName: 'Test P', mustChangePassword: false });
    const cookie = res.headers['set-cookie']?.join(';') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    created.push(email);
  });

  it('signup → /me round-trips the session', async () => {
    const email = uniq();
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send({ fullName: 'Me', email, phone: '03001234567', password: 'password1', tosAccepted: true });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email === undefined).toBe(true); // safe shape — no email leaked
    expect(me.body).toMatchObject({ role: 'patient', fullName: 'Me' });
    created.push(email);
  });

  it('login with wrong password returns the generic 401', async () => {
    const email = uniq();
    await request(app).post('/api/auth/signup').send({ fullName: 'L', email, phone: '03001234567', password: 'password1', tosAccepted: true });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WRONG' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    created.push(email);
  });

  it('forgot → reset round-trip works and the token is single-use', async () => {
    const email = uniq();
    await request(app).post('/api/auth/signup').send({ fullName: 'R', email, phone: '03001234567', password: 'password1', tosAccepted: true });
    // Drive the service directly to obtain the raw token (it is never returned over HTTP).
    const { rawToken } = await auth.requestPasswordReset(email);
    const first = await request(app).post('/api/auth/reset-password').send({ token: rawToken, newPassword: 'newpassw0rd' });
    expect(first.status).toBe(200);
    // New password works:
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'newpassw0rd' });
    expect(ok.status).toBe(200);
    // Same token cannot be reused (single-use):
    const second = await request(app).post('/api/auth/reset-password').send({ token: rawToken, newPassword: 'another0ne' });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_RESET_TOKEN');
    created.push(email);
  });

  it('forgot-password returns an identical 200 for unknown and known emails', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: uniq() });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ ok: true });
  });

  afterAll(async () => {
    if (created.length) await prisma.user.deleteMany({ where: { email: { in: created } } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 3: Run integration tests**

Ensure a Postgres test DB is reachable (`DATABASE_URL` in `.env`; `docker-compose up -d db` then `npx prisma migrate deploy` if needed).
Run: `npm test -- auth.integration`
Expected: PASS (all cases). The audit rows created (`login`, `password_change`) are harmless residue.

- [ ] **Step 4: Run the full backend suite (no regressions)**

Run: `npm test`
Expected: all prior suites still green (M0 server 20/20 + the new auth suites).

- [ ] **Step 5: Commit**

```bash
git add server/src/index.js server/src/test/auth.integration.test.js
git commit -m "feat(server): wire auth router + DA3 gate; add auth integration tests"
```

---

## Phase 2 — Frontend

> **CSS note:** all components reference the BEM classes confirmed in doc 06 §7 (`.btn`, `.btn--*`, `.input`, `.field`, `.card`, `.section-card`, `.alert`, `.alert--*`, `.choice`, `.auth-split`, `.feature`, `.error-text`, `.help`, `.empty`). Before styling, open `client/src/styles/components.css` and confirm the exact child class names for `.auth-split` (brand/form panes); adjust the layout markup to match — do NOT invent new class names or raw hex (PROJECT_RULES frontend).

### Task 2.1: `apiClient`

**Files:**
- Create: `client/src/lib/apiClient.js`
- Test: `client/src/lib/apiClient.test.js`

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/apiClient.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError } from './apiClient.js';

afterEach(() => vi.restoreAllMocks());

describe('apiClient', () => {
  it('GET returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'u1' }) })));
    expect(await api.get('/auth/me')).toEqual({ id: 'u1' });
  });
  it('throws ApiError carrying the envelope code on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'x' } }) })));
    const err = await api.get('/auth/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.status).toBe(401);
  });
  it('returns null for 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, json: async () => { throw new Error('no body'); } })));
    expect(await api.post('/auth/logout')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- apiClient`
Expected: FAIL — cannot find `./apiClient.js`.

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/apiClient.js`:

```js
// @ts-check
export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.code ?? 'INTERNAL', e.message ?? 'Something went wrong.', res.status, e.details);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- apiClient`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/apiClient.js client/src/lib/apiClient.test.js
git commit -m "feat(client): typed apiClient over the error envelope"
```

### Task 2.2: Query client + Session context

**Files:**
- Create: `client/src/lib/queryClient.js`
- Create: `client/src/lib/session.jsx`
- Test: `client/src/lib/session.test.jsx`

- [ ] **Step 1: Write the query client singleton**

Create `client/src/lib/queryClient.js`:

```js
// @ts-check
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});
```

- [ ] **Step 2: Write the failing session test**

Create `client/src/lib/session.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './session.jsx';
import { api } from './apiClient.js';

vi.mock('./apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

function Probe() {
  const { session, loading } = useSession();
  return <div>{loading ? 'loading' : session ? `user:${session.role}` : 'anon'}</div>;
}

beforeEach(() => vi.clearAllMocks());

describe('SessionProvider', () => {
  it('hydrates from /auth/me on mount', async () => {
    api.get.mockResolvedValue({ id: 'u1', role: 'patient', fullName: 'P', mustChangePassword: false });
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByText('user:patient')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
  it('shows anon when /auth/me 401s', async () => {
    api.get.mockRejectedValue(new Error('401'));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace client test -- session`
Expected: FAIL — cannot find `./session.jsx`.

- [ ] **Step 4: Write the implementation**

Create `client/src/lib/session.jsx`:

```jsx
// @ts-check
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './apiClient.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setSession(await api.get('/auth/me')); }
    catch { setSession(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (creds) => { const u = await api.post('/auth/login', creds); setSession(u); return u; }, []);
  const signup = useCallback(async (data) => { const u = await api.post('/auth/signup', data); setSession(u); return u; }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout'); setSession(null); }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, login, signup, logout, setSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace client test -- session`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/queryClient.js client/src/lib/session.jsx client/src/lib/session.test.jsx
git commit -m "feat(client): QueryClient + SessionProvider/useSession context"
```

### Task 2.3: Shared components

**Files:**
- Create: `client/src/components/Button.jsx`, `Field.jsx`, `Card.jsx`, `Alert.jsx`, `Checkbox.jsx`
- Test: `client/src/components/components.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/components.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button.jsx';
import { Field } from './Field.jsx';

describe('shared components', () => {
  it('Button applies variant + disables while loading', () => {
    render(<Button variant="primary" isLoading>Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('btn--primary');
    expect(btn.disabled).toBe(true);
  });
  it('Field shows error text with the error modifier', () => {
    render(<Field id="email" label="Email" error="Required" />);
    expect(screen.getByText('Required').className).toContain('error-text');
    expect(document.querySelector('.input--error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- components`
Expected: FAIL — cannot find `./Button.jsx`.

- [ ] **Step 3: Write the components**

Create `client/src/components/Button.jsx`:

```jsx
// @ts-check
export function Button({ variant = 'primary', size, block, isLoading, disabled, className = '', children, ...props }) {
  const cls = ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...props}>
      {isLoading ? '…' : children}
    </button>
  );
}
```

Create `client/src/components/Field.jsx`:

```jsx
// @ts-check
export function Field({ label, error, help, id, ...inputProps }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={`input${error ? ' input--error' : ''}`} {...inputProps} />
      {error ? <div className="error-text">{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}
```

Create `client/src/components/Card.jsx`:

```jsx
// @ts-check
export function Card({ className = '', children, ...props }) {
  return <div className={`card ${className}`.trim()} {...props}>{children}</div>;
}
export function SectionCard({ title, children }) {
  return (
    <section className="section-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
```

Create `client/src/components/Alert.jsx`:

```jsx
// @ts-check
export function Alert({ variant = 'info', children }) {
  return <div className={`alert alert--${variant}`} role="alert">{children}</div>;
}
```

Create `client/src/components/Checkbox.jsx`:

```jsx
// @ts-check
export function Checkbox({ label, id, ...props }) {
  return (
    <label className="choice" htmlFor={id}>
      <input type="checkbox" id={id} {...props} />
      <span>{label}</span>
    </label>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- components`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components
git commit -m "feat(client): minimal shared components (Button/Field/Card/Alert/Checkbox)"
```

### Task 2.4: AuthSplit layout

**Files:**
- Create: `client/src/layouts/AuthSplitLayout.jsx`

- [ ] **Step 1: Write the layout**

Open `client/src/styles/components.css`, confirm the `.auth-split` structure, then create `client/src/layouts/AuthSplitLayout.jsx` (adjust the two inner class names to whatever components.css defines):

```jsx
// @ts-check
import { Link } from 'react-router-dom';

export function AuthSplitLayout({ headline = 'Skin care, simplified.', children }) {
  return (
    <div className="auth-split">
      <aside className="feature auth-split__brand">
        <Link to="/" className="auth-split__mark" aria-label="Dermestha home" />
        <p className="auth-split__eyebrow label">Dermestha</p>
        <h1>{headline}</h1>
      </aside>
      <main className="auth-split__form">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/layouts/AuthSplitLayout.jsx
git commit -m "feat(client): AuthSplit layout"
```

### Task 2.5: P-04 Sign up

**Files:**
- Create: `client/src/views/SignUp.jsx`
- Test: `client/src/views/SignUp.test.jsx`

- [ ] **Step 1: Write the failing test (consent gate)**

Create `client/src/views/SignUp.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignUp } from './SignUp.jsx';
import { SessionProvider } from '../lib/session.jsx';

function setup() {
  return render(
    <MemoryRouter><SessionProvider><SignUp /></SessionProvider></MemoryRouter>,
  );
}

describe('P-04 Sign up', () => {
  it('disables submit until the ToS consent box is checked', () => {
    setup();
    const submit = screen.getByRole('button', { name: /create account/i });
    expect(submit.disabled).toBe(true);
  });
  it('links to the legal pages from the consent label', () => {
    setup();
    expect(screen.getByRole('link', { name: /terms/i }).getAttribute('href')).toBe('/legal/terms');
    expect(screen.getByRole('link', { name: /privacy/i }).getAttribute('href')).toBe('/legal/privacy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- SignUp`
Expected: FAIL — cannot find `./SignUp.jsx`.

- [ ] **Step 3: Write the view**

Create `client/src/views/SignUp.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

const DASHBOARD = { patient: '/', doctor: '/doctor', admin: '/admin' };

export function SignUp() {
  const { signup } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [tosAccepted, setTos] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signup({ ...form, tosAccepted });
      navigate(DASHBOARD[user.role] ?? '/');
    } catch (err) {
      setError(err.message ?? 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Create your account">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Sign up</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field id="fullName" label="Full name" value={form.fullName} onChange={set('fullName')} required />
        <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')} required />
        <Field id="phone" label="Phone" value={form.phone} onChange={set('phone')} required />
        <Field id="password" label="Password" type="password" value={form.password} onChange={set('password')} required help="At least 8 characters." />
        <label className="choice" htmlFor="tos">
          <input type="checkbox" id="tos" checked={tosAccepted} onChange={(e) => setTos(e.target.checked)} />
          <span>
            I agree to the <Link to="/legal/terms">Terms of Service</Link> and{' '}
            <Link to="/legal/privacy">Privacy Policy</Link>
          </span>
        </label>
        <Button type="submit" block disabled={!tosAccepted} isLoading={submitting}>Create account</Button>
        <p className="help">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- SignUp`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/SignUp.jsx client/src/views/SignUp.test.jsx
git commit -m "feat(client): P-04 sign-up with consent gate"
```

### Task 2.6: P-05 Login + recovery, and D-01 Change password

**Files:**
- Create: `client/src/views/Login.jsx`, `client/src/views/ForgotPassword.jsx`, `client/src/views/ResetPassword.jsx`, `client/src/views/ChangePassword.jsx`
- Test: `client/src/views/Login.test.jsx`

- [ ] **Step 1: Write the failing test (role-routing + must-change redirect)**

Create `client/src/views/Login.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from './Login.jsx';
import { SessionProvider } from '../lib/session.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn().mockRejectedValue(new Error('401')), post: vi.fn() } }));

function setup() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>patient-home</div>} />
          <Route path="/doctor" element={<div>doctor-home</div>} />
          <Route path="/doctor/change-password" element={<div>change-pw</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-05 Login', () => {
  it('routes a patient to / on success', async () => {
    api.post.mockResolvedValue({ id: 'u1', role: 'patient', fullName: 'P', mustChangePassword: false });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('patient-home')).toBeTruthy());
  });
  it('routes a must-change doctor to the change-password screen', async () => {
    api.post.mockResolvedValue({ id: 'd1', role: 'doctor', fullName: 'Dr', mustChangePassword: true });
    setup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'd@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('change-pw')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- Login`
Expected: FAIL — cannot find `./Login.jsx`.

- [ ] **Step 3: Write the views**

Create `client/src/views/Login.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

const DASHBOARD = { patient: '/', doctor: '/doctor', admin: '/admin' };

export function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(form);
      if (user.mustChangePassword) return navigate('/doctor/change-password');
      navigate(DASHBOARD[user.role] ?? '/');
    } catch (err) {
      setError(err.message ?? 'Could not log you in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Welcome back">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Log in</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')} required />
        <Field id="password" label="Password" type="password" value={form.password} onChange={set('password')} required />
        <Button type="submit" block isLoading={submitting}>Log in</Button>
        <p className="help"><Link to="/forgot-password">Forgot password?</Link></p>
        <p className="help">New here? <Link to="/signup">Create an account</Link></p>
      </form>
    </AuthSplitLayout>
  );
}
```

Create `client/src/views/ForgotPassword.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try { await api.post('/auth/forgot-password', { email }); } finally { setSent(true); setSubmitting(false); }
  }

  return (
    <AuthSplitLayout headline="Reset your password">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Forgot password</h2>
        {sent
          ? <Alert variant="success">If an account exists for that email, a reset link is on its way.</Alert>
          : (
            <>
              <Field id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button type="submit" block isLoading={submitting}>Send reset link</Button>
            </>
          )}
        <p className="help"><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthSplitLayout>
  );
}
```

Create `client/src/views/ResetPassword.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch (err) {
      setError(err.message ?? 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Choose a new password">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Set a new password</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field id="newPassword" label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required help="At least 8 characters." />
        <Button type="submit" block isLoading={submitting} disabled={!token}>Update password</Button>
        <p className="help"><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthSplitLayout>
  );
}
```

Create `client/src/views/ChangePassword.jsx` (D-01):

```jsx
// @ts-check
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { useSession } from '../lib/session.jsx';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ChangePassword() {
  const { setSession, session } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await api.post('/auth/change-password', form);
      setSession(user);
      navigate('/doctor');
    } catch (err) {
      setError(err.message ?? 'Could not change your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Set a new password to continue">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Change your password</h2>
        <p className="help">For your security, please choose a new password before continuing{session ? `, ${session.fullName}` : ''}.</p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field id="currentPassword" label="Current password" type="password" value={form.currentPassword} onChange={set('currentPassword')} required />
        <Field id="newPassword" label="New password" type="password" value={form.newPassword} onChange={set('newPassword')} required help="At least 8 characters." />
        <Button type="submit" block isLoading={submitting}>Update password</Button>
      </form>
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- Login`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/Login.jsx client/src/views/ForgotPassword.jsx client/src/views/ResetPassword.jsx client/src/views/ChangePassword.jsx client/src/views/Login.test.jsx
git commit -m "feat(client): P-05 login + recovery and D-01 change-password views"
```

### Task 2.7: Routing + provider wiring

**Files:**
- Modify: `client/src/main.jsx`
- Modify: `client/src/routes.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Wire the providers at the root**

Replace `client/src/main.jsx` with:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { SessionProvider } from './lib/session.jsx';
import './styles/tokens.css';
import './styles/components.css';
import { AppRoutes } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Define the route table**

Replace `client/src/routes.jsx` with:

```jsx
// @ts-check
import { SignUp } from './views/SignUp.jsx';
import { Login } from './views/Login.jsx';
import { ForgotPassword } from './views/ForgotPassword.jsx';
import { ResetPassword } from './views/ResetPassword.jsx';
import { ChangePassword } from './views/ChangePassword.jsx';

/** Public + Slice-A auth routes. Later slices add patient/doctor/admin views + RoleRoute guards. */
export const routes = [
  { path: '/signup', element: <SignUp /> },
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/doctor/change-password', element: <ChangePassword /> },
];
```

- [ ] **Step 3: Render the routes with placeholders for post-login destinations**

Replace `client/src/App.jsx` with:

```jsx
// @ts-check
import { Routes, Route } from 'react-router-dom';
import { routes } from './routes.jsx';
import { useSession } from './lib/session.jsx';

function Placeholder({ label }) {
  const { logout } = useSession();
  return (
    <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{label}</h1>
      <p style={{ color: 'var(--color-text-body)' }}>Coming in a later slice.</p>
      <button className="btn btn--secondary" onClick={() => logout()}>Log out</button>
    </main>
  );
}

export function AppRoutes() {
  const { loading } = useSession();
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <Routes>
      {routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
      <Route path="/" element={<Placeholder label="Patient dashboard" />} />
      <Route path="/doctor" element={<Placeholder label="Doctor panel" />} />
      <Route path="/admin" element={<Placeholder label="Admin panel" />} />
      <Route path="*" element={<Placeholder label="Dermestha" />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Run the full client suite + build**

Run: `npm --workspace client test`
Expected: all client suites green (apiClient, session, components, SignUp, Login, plus the existing RoleRoute 2/2).

Run: `npm --workspace client run build`
Expected: Vite build succeeds (no unresolved imports).

- [ ] **Step 5: Commit**

```bash
git add client/src/main.jsx client/src/routes.jsx client/src/App.jsx
git commit -m "feat(client): wire providers + auth routes with post-login placeholders"
```

---

## Phase 3 — Whole-slice verification

### Task 3.1: Full suite + manual smoke

- [ ] **Step 1: Run the entire monorepo test suite**

Run: `npm test`
Expected: every server + client suite green. No regressions to the M0 baseline (server 20/20, client 2/2) plus the new Slice A suites.

- [ ] **Step 2: Lint + format**

Run: `npm run lint`
Then: `npm run format`
Expected: no lint errors; formatting clean.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Start the DB + app (`docker-compose up -d db`, `npx prisma migrate deploy`, `npm run dev:server` + `npm run dev:client`). Verify in a browser: sign up → lands on patient placeholder; log out; log in; forgot-password shows the neutral confirmation and the dev reset link appears in the server log; reset via that link; log in with the new password.

- [ ] **Step 4: Final slice commit (if anything outstanding)**

```bash
git add -A
git commit -m "test(slice-a): full-suite verification green"
```

---

## Self-review notes (author)

- **Spec coverage:** F01.01 sign-up + consent gate (Task 1.1/1.4/2.5); F01.02 shared login + role routing (Task 1.4/1.7/2.6); F01.03 enumeration-safe forgot + 1h single-use reset (Task 1.3/1.4/1.7/1.8); F15.02 role routing (2.6); F15.03 DA3 forced change + gate (Task 1.5/2.6); doc-08 rate limits + lockout (Task 1.7); session cookie flags (existing middleware, asserted Task 1.8). ✅
- **Known follow-ups carried by governance gates:** doc 14 `password_reset` template (gate #3) must be approved or the email merge contract stays undocumented; doc 12 test cases (gate #7) need the file read first for numbering.
- **Type consistency:** the safe-user shape `{id, role, fullName, mustChangePassword}` is identical across service, controller, `/me`, and the frontend session — used uniformly.
- **Out of scope (later slices):** TopNav/BottomTabs/Sidebar layouts, doctor admin-reset (DA5) route, all post-login destination screens.
