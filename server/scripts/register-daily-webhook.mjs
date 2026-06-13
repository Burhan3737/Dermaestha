#!/usr/bin/env node
// One-time OPS step (NOT runtime). Registers the Daily webhook for participant join/leave events
// and prints the `hmac` secret to copy into DAILY_WEBHOOK_SECRET.
//
// Usage:
//   DAILY_API_KEY=dk_xxx APP_BASE_URL=https://app.example.com node server/scripts/register-daily-webhook.mjs
//
// retryType 'exponential' is deliberate: the default 'circuit-breaker' DISABLES the webhook after
// 3 consecutive failures. After running, set DAILY_WEBHOOK_SECRET=<printed hmac> and validate the
// signed-string (raw body vs JSON.stringify) against a live delivery (doc 07 launch gate).

const apiKey = process.env.DAILY_API_KEY;
const appBaseUrl = process.env.APP_BASE_URL;
if (!apiKey || !appBaseUrl) {
  console.error('Set DAILY_API_KEY and APP_BASE_URL in the environment first.');
  process.exit(1);
}

const res = await fetch('https://api.daily.co/v1/webhooks', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `${appBaseUrl}/api/webhooks/daily`,
    eventTypes: ['participant.joined', 'participant.left'],
    retryType: 'exponential',
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(`Daily POST /v1/webhooks responded ${res.status}:`, body);
  process.exit(1);
}
console.log('Webhook registered. Copy this into DAILY_WEBHOOK_SECRET:\n');
console.log(body.hmac);
console.log('\nFull response:', JSON.stringify(body, null, 2));
