# Slice H · S5 — Email Template Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render real, on-brand plain-text transactional email copy for all 8 templates from one shared module used by both email adapters, replacing the current debug-dump body.

**Architecture:** A new `templates.js` owns a `formatPKR` money helper, a shared `FOOTER`, a per-template `{ subject, body(vars) }` map, and a single `render(template, vars) => { subject, text }`. The real Resend adapter and the dev console adapter both call `render()` — no transport, outbox, worker, or adapter-selection changes. The merge-var data contract (doc 14 §5) is fixed; only the rendered prose changes.

**Tech Stack:** Node ESM (`type: module`), Vitest, no new dependencies. Plain text only (no HTML, no `date-fns` changes — `slotStartLocal` is already a pre-formatted string from the notification service).

---

## Context the engineer needs

- **Money is paisa.** `fee` (from `feeAtBooking`), `amount` and `refundAmount` (from `payment.amount − gatewayFee`) all arrive as integer paisa. The copy layer formats them as rupees via `formatPKR`. Never render raw paisa.
- **`slotStartLocal` is already a string** (`"EEE, dd MMM yyyy HH:mm"`, Asia/Karachi), produced by `server/src/modules/notification/service.js`. Do not re-format it.
- **Callers may pass extra vars.** `enqueueCancellationEmail` (appointment service) passes a superset (`amount`, `refundAmount`, `refundRef`, `appointmentRef`, `slotStartLocal`, `doctorName`) for BOTH `refund_confirmation` and `cancellation_apology`. Each template body composes only the lines it needs; extra vars are ignored.
- **Null vars omit their line.** e.g. a null `doctorName` or `refundAmount` must drop that whole line (no literal "null"). The body composes a list of lines, filters null/undefined-producing lines, then appends `FOOTER` exactly once joined by a blank line where the spec shows blank lines.
- **Vars per template (doc 14 §5 — the fixed contract):**
  - `booking_confirmation`: `patientName, doctorName, slotStartLocal, fee, dashboardUrl`
  - `reminder_24h`: `patientName, doctorName, slotStartLocal, joinUrl`
  - `reminder_1h`: same as `reminder_24h`
  - `prescription_ready`: `patientName, doctorName, prescriptionUrl`
  - `refund_confirmation`: `patientName, amount, refundRef, appointmentRef`
  - `cancellation_apology`: `patientName, doctorName, slotStartLocal, refundAmount`
  - `refund_delayed`: `patientName, appointmentRef`
  - `password_reset`: `resetUrl, expiresInMinutes`
- **Verbatim copy:** use the literal copy from the design spec §3 (`docs/superpowers/specs/2026-06-13-slice-h-s5-email-template-copy-design.md`).

## File Structure

- **Create** `server/src/integrations/email/templates.js` — `formatPKR`, `FOOTER`, `SUPPORT_EMAIL` placeholder constant, `templates` map, `render()`.
- **Create** `server/src/integrations/email/templates.test.js` — unit tests for the module.
- **Modify** `server/src/integrations/email/resend.js` — replace `SUBJECTS` + `renderText` with `render()`.
- **Modify** `server/src/integrations/email/console.dev.js` — log rendered `{ to, subject, text }`.
- **Modify** `server/src/integrations/email/resend.test.js` — assert rendered subject/text via `render()` path.
- **Modify** `server/src/integrations/email/console.dev.test.js` — assert it logs the rendered email.
- **Modify** `server/src/integrations/email/index.js` — only if the `EmailProvider` typedef needs a touch (see Task 5; likely no change).

## Constraints (apply to every task)

- DO NOT create/edit/delete anything under `agentChangeLogs/`.
- DO NOT edit/commit anything under `docs/superpowers/specs/` or `docs/specification/` (00–15). This plan file under `docs/superpowers/plans/` is the only doc to write.
- Keep all existing email/notification tests green (the var contract is unchanged).

---

### Task 1: `templates.js` — `formatPKR` + `FOOTER` + `SUPPORT_EMAIL`

**Files:**
- Create: `server/src/integrations/email/templates.js`
- Test: `server/src/integrations/email/templates.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { formatPKR, FOOTER, SUPPORT_EMAIL } from './templates.js';

describe('formatPKR', () => {
  it('formats paisa as grouped integer rupees', () => {
    expect(formatPKR(250000)).toBe('PKR 2,500');
  });
  it('formats a large amount with en-PK grouping', () => {
    expect(formatPKR(150000000)).toBe('PKR 1,500,000');
  });
});

describe('FOOTER', () => {
  it('is a single line referencing the support email placeholder', () => {
    expect(FOOTER).toContain('Dermestha');
    expect(FOOTER).toContain(SUPPORT_EMAIL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- templates`
Expected: FAIL — cannot resolve `./templates.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// @ts-check

/** Pre-launch placeholder; confirm the real support inbox before go-live (design spec §5). */
export const SUPPORT_EMAIL = 'support@dermestha.example';

/** Appended once to every email body. */
export const FOOTER = `— Dermestha · Online dermatology consultations · Need help? ${SUPPORT_EMAIL}`;

/** Render integer-paisa money as grouped rupees, e.g. 250000 → "PKR 2,500" (en-PK). */
export function formatPKR(paisa) {
  return `PKR ${Math.round(paisa / 100).toLocaleString('en-PK')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- templates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/email/templates.js server/src/integrations/email/templates.test.js
git commit -m "feat(email): add formatPKR + FOOTER + SUPPORT_EMAIL (S5)"
```

---

### Task 2: `templates` map + `render()` — all 8 templates

**Files:**
- Modify: `server/src/integrations/email/templates.js`
- Test: `server/src/integrations/email/templates.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { render } from './templates.js';

const ALL = [
  'booking_confirmation', 'reminder_24h', 'reminder_1h', 'prescription_ready',
  'refund_confirmation', 'cancellation_apology', 'refund_delayed', 'password_reset',
];

const sampleVars = {
  patientName: 'Ayesha', doctorName: 'Dr. Khan', slotStartLocal: 'Mon, 16 Jun 2026 14:00',
  fee: 250000, dashboardUrl: 'https://app/appointments', joinUrl: 'https://app/appointments',
  prescriptionUrl: 'https://app/rx', amount: 250000, refundAmount: 250000,
  refundRef: 'rf_1', appointmentRef: 'ap_1', resetUrl: 'https://app/reset', expiresInMinutes: 30,
};

describe('render', () => {
  it('renders every template with a non-empty subject and plain-text body', () => {
    for (const t of ALL) {
      const { subject, text } = render(t, sampleVars);
      expect(subject, t).toBeTruthy();
      expect(text, t).toBeTruthy();
      expect(text, t).not.toMatch(/\bnull\b|\bundefined\b/);
      expect(text, t).not.toMatch(/^\w+:\s/m); // no leftover key: value debug lines
    }
  });

  it('formats money as rupees, never raw paisa', () => {
    const { text } = render('booking_confirmation', sampleVars);
    expect(text).toContain('PKR 2,500');
    expect(text).not.toContain('250000');
  });

  it('appends the footer exactly once', () => {
    const { text } = render('refund_delayed', sampleVars);
    expect(text.split('— Dermestha').length - 1).toBe(1);
  });

  it('omits a line whose var is null (refundAmount)', () => {
    const { text } = render('cancellation_apology', { ...sampleVars, refundAmount: null });
    expect(text).not.toMatch(/refund/i);
    expect(text).not.toContain('null');
  });

  it('omits the doctor name line when doctorName is null', () => {
    const { text } = render('prescription_ready', { ...sampleVars, doctorName: null });
    expect(text).not.toContain('null');
    expect(text).toContain('prescription'); // body still renders
  });

  it('password_reset interpolates the expiry and reset link', () => {
    const { subject, text } = render('password_reset', sampleVars);
    expect(subject).toMatch(/reset/i);
    expect(text).toContain('30 minutes');
    expect(text).toContain('https://app/reset');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- templates`
Expected: FAIL — `render` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `templates.js`. Each `body` returns the verbatim spec §3 copy, built from an ordered list of line-groups where any group containing a null/undefined var is dropped; `FOOTER` is appended last. Use a small line-composition helper so null-var lines disappear cleanly.

```js
/** Join non-empty blocks with a blank line, then append the footer once. */
function compose(blocks) {
  const body = blocks.filter((b) => b != null && b !== '').join('\n\n');
  return `${body}\n\n${FOOTER}`;
}

/** Each template: subject string + body(vars) => string (footer appended by compose). */
export const templates = {
  booking_confirmation: {
    subject: 'Your Dermestha appointment is confirmed',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `Your consultation with ${v.doctorName} is confirmed.` : null,
        [
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          v.fee != null ? `Fee paid: ${formatPKR(v.fee)}` : null,
        ].filter((l) => l != null).join('\n') || null,
        `Join from your appointments dashboard a few minutes before the start time:\n${v.dashboardUrl}`,
        'See you soon.',
      ]),
  },

  reminder_24h: {
    subject: 'Reminder: your Dermestha appointment is tomorrow',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `A reminder of your consultation with ${v.doctorName}.` : null,
        [
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          `Join here when it's time: ${v.joinUrl}`,
        ].filter((l) => l != null).join('\n'),
        'Tip: find a well-lit, quiet spot so your doctor can see your skin clearly.',
      ]),
  },

  reminder_1h: {
    subject: 'Reminder: your Dermestha appointment starts in 1 hour',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null
          ? `Your consultation with ${v.doctorName} starts in about an hour.`
          : null,
        [
          v.slotStartLocal != null ? `When: ${v.slotStartLocal} (Pakistan time)` : null,
          `Join here: ${v.joinUrl}`,
        ].filter((l) => l != null).join('\n'),
        'You can join a few minutes early to check your camera and microphone.',
      ]),
  },

  prescription_ready: {
    subject: 'Your Dermestha prescription is ready',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null ? `${v.doctorName} has issued your prescription.` : null,
        `View and download it here:\n${v.prescriptionUrl}`,
        'This link stays available in your appointments dashboard.',
      ]),
  },

  refund_confirmation: {
    subject: 'Your Dermestha refund has been initiated',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        `We've initiated a refund for your appointment (${v.appointmentRef}).`,
        [
          v.amount != null ? `Refund amount: ${formatPKR(v.amount)}` : null,
          v.refundRef != null ? `Reference: ${v.refundRef}` : null,
        ].filter((l) => l != null).join('\n') || null,
        'It may take a few business days to appear, depending on your bank or card provider.',
      ]),
  },

  cancellation_apology: {
    subject: 'Your Dermestha appointment was cancelled',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        v.doctorName != null && v.slotStartLocal != null
          ? `We're sorry — your consultation with ${v.doctorName} on ${v.slotStartLocal} (Pakistan time) has been cancelled.`
          : `We're sorry — your consultation has been cancelled.`,
        v.refundAmount != null
          ? `A refund of ${formatPKR(v.refundAmount)} has been initiated and may take a few business days to appear.`
          : null,
        "You're welcome to book another appointment whenever suits you.",
      ]),
  },

  refund_delayed: {
    subject: 'Your Dermestha refund is taking longer than expected',
    body: (v) =>
      compose([
        `Hi ${v.patientName},`,
        `The refund for your appointment (${v.appointmentRef}) is taking longer than usual to process.`,
        "We're on it — you don't need to do anything, and we'll confirm as soon as it's complete.",
        'Thank you for your patience.',
      ]),
  },

  password_reset: {
    subject: 'Reset your Dermestha password',
    body: (v) =>
      compose([
        'Hi,',
        'We received a request to reset your Dermestha password.',
        `Reset it here (link expires in ${v.expiresInMinutes} minutes):\n${v.resetUrl}`,
        "If you didn't request this, you can safely ignore this email — your password won't change.",
      ]),
  },
};

/** Single entry point used by both adapters. Falls back to a generic subject for unknown types. */
export function render(template, vars = {}) {
  const t = templates[template];
  if (!t) return { subject: 'Dermestha notification', text: FOOTER };
  return { subject: t.subject, text: t.body(vars) };
}
```

> NOTE for the implementer: the `cancellation_apology` fallback branch (no doctor/slot) is a defensive degrade only — the contract always supplies both. The decision to degrade rather than drop the whole sentence is a design choice; if the reviewer prefers omitting the sentence, adjust. Verify the null-omission tests still pass either way.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- templates`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/email/templates.js server/src/integrations/email/templates.test.js
git commit -m "feat(email): render real copy for all 8 templates via render() (S5)"
```

---

### Task 3: Refactor `resend.js` to use `render()`

**Files:**
- Modify: `server/src/integrations/email/resend.js`
- Test: `server/src/integrations/email/resend.test.js`

- [ ] **Step 1: Update the test to assert the rendered body**

Keep the existing two tests; tighten the first to assert the real body text and add the `text` assertion:

```js
  it('POSTs to the Resend API with auth header and the rendered subject + body', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 're_123' }) });
    const out = await resendEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P', doctorName: 'Dr. K', slotStartLocal: 'Mon 14:00', fee: 250000, dashboardUrl: 'https://app' },
    });
    expect(out).toEqual({ providerId: 're_123' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk_test');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('no-reply@dermestha.example');
    expect(body.to).toEqual(['p@t.test']);
    expect(body.subject).toMatch(/confirmed/i);
    expect(body.text).toContain('Hi P,');
    expect(body.text).toContain('PKR 2,500');
    expect(body.text).toContain('— Dermestha');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — `body.text` is the old `key: value` dump (`patientName: P\n...`), not `Hi P,`.

- [ ] **Step 3: Refactor the adapter**

Replace the `SUBJECTS` map and `renderText` with a `render()` import:

```js
// @ts-check
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';
import { render } from './templates.js';

/** Real Resend adapter. Selected when RESEND_API_KEY is configured. */
/** @type {import('./index.js').EmailProvider} */
export const resendEmail = {
  async send({ template, to, vars }) {
    const { subject, text } = render(template, vars);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'onboarding@resend.dev',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      throw new AppError('EMAIL_SEND_FAILED', `Resend responded ${res.status}`, 502);
    }
    const body = await res.json();
    return { providerId: body.id };
  },
  parseWebhook() {
    throw new AppError('NOT_IMPLEMENTED', 'resend.parseWebhook is M4', 501);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- resend`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/email/resend.js server/src/integrations/email/resend.test.js
git commit -m "refactor(email): resend adapter renders via render() (S5)"
```

---

### Task 4: Refactor `console.dev.js` to log the rendered email

**Files:**
- Modify: `server/src/integrations/email/console.dev.js`
- Test: `server/src/integrations/email/console.dev.test.js`

- [ ] **Step 1: Update the test to assert the rendered log**

```js
import { describe, it, expect, vi } from 'vitest';
import { consoleEmail } from './console.dev.js';
import { logger } from '../../lib/logger/logger.js';

describe('consoleEmail dev adapter', () => {
  it('send resolves with a providerId and never throws', async () => {
    const out = await consoleEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P', fee: 250000, dashboardUrl: 'https://app' },
    });
    expect(out.providerId).toMatch(/^dev_/);
  });

  it('logs the rendered subject + body (the real email), not the raw vars', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    consoleEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P', fee: 250000, dashboardUrl: 'https://app' },
    });
    const [, payload] = spy.mock.calls[0];
    expect(payload.to).toBe('p@t.test');
    expect(payload.subject).toMatch(/confirmed/i);
    expect(payload.text).toContain('Hi P,');
    expect(payload).not.toHaveProperty('vars');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- console.dev`
Expected: FAIL — current adapter logs `{ template, to, vars }`, no `subject`/`text`.

- [ ] **Step 3: Refactor the adapter**

```js
// @ts-check
import { logger } from '../../lib/logger/logger.js';
import { render } from './templates.js';

/** Dev email adapter: logs the rendered email instead of sending. Selected when EMAIL_PROVIDER=console. */
/** @type {import('./index.js').EmailProvider} */
export const consoleEmail = {
  async send({ template, to, vars }) {
    const { subject, text } = render(template, vars);
    logger.info('DEV email', { to, subject, text });
    return { providerId: `dev_${Date.now()}` };
  },
  parseWebhook() {
    throw new Error('console.dev parseWebhook not supported');
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- console.dev`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/email/console.dev.js server/src/integrations/email/console.dev.test.js
git commit -m "refactor(email): console adapter logs rendered email (S5)"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full server + shared suite**

Run: `npm test`
Expected: all green. Pay attention to any notification-service or appointment/admin/auth tests that exercised the old body shape — the var contract is unchanged so they should pass. If any asserted the old `key: value` dump, fix that assertion to the new rendered body (note it in the handoff).

- [ ] **Step 2: Run the client suite (must stay green)**

Run: `npm --workspace client test`
Expected: all green (S5 is server-only; client should be untouched).

- [ ] **Step 3: Confirm `index.js` `EmailProvider` typedef**

Open `server/src/integrations/email/index.js`. The `EmailProvider` typedef already matches (`send(args) => Promise<{ providerId }>`). No change expected; only edit if a type mismatch surfaces. Record the verdict in the handoff.

- [ ] **Step 4: Commit (only if Step 1/2 required test fixes)**

```bash
git add -A server/
git commit -m "test(email): align adapter/notification tests to rendered body (S5)"
```

---

## Doc-impact (tracked; applied at task end with approval — DO NOT apply during build)

| Doc | Change |
| --- | --- |
| 14 | §5 — resolve the "Merge-vars are the data contract; final copy is M4" note (copy now shipped, plain text); vars unchanged |
| 13 | M4 "Email automation" → final template copy Built (plain text) |
| 15 | If `SUPPORT_EMAIL` / footer entity become env values, add them; else they remain documented placeholder constants in `templates.js` |

**Pre-launch nicety (non-blocking):** confirm the real support email + footer entity name to replace the `SUPPORT_EMAIL` placeholder.

## Self-review notes

- **Spec coverage:** §1 deliverables 1–4 map to Tasks 1–2 (module), 3 (resend), 4 (console), 1–2+5 (tests). §3 copy is reproduced verbatim in Task 2. §4 testing maps to Task 2 + 5.
- **Type consistency:** `render(template, vars) => { subject, text }`, `formatPKR(paisa)`, `FOOTER`, `SUPPORT_EMAIL`, `templates[type].{subject, body}` used consistently across all tasks.
- **No placeholders:** every code step shows complete code.
</content>
</invoke>
