# 2026-06-28-1439 — video-join-recursion-fix

**Status:** Completed (fix verified incl. live 2-party call; commit + optional cleanup + spec apply pending user approval)
**Goal:** Diagnose & fix broken video joining (both patient & doctor) and answer whether Daily.co delivers free phase-1 video.
**Skill(s) used:** superpowers:brainstorming (opted in, user-invoked) → handed off to superpowers:systematic-debugging (recommended for the debugging half, user-approved).
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None yet (awaiting final visual verification + user approval to commit)
**Last updated:** 2026-06-28-1439
**Tags:** #bugfix #video #daily

## Summary
Video join recursively self-embeds for both roles (cascading "Time remaining" timers, eventual HTTP 431). Root cause (proven live): the dev server runs `VIDEO_PROVIDER=mock`; `daily.mock.createRoom` returns the app's own `/video/:id` URL as `roomUrl`, and the client's mock branch is dead (`service.js` always returns `joinSimUrl:null`, so `isMock` in `VideoRoom.jsx` is permanently false), so the fake URL is handed to Daily Prebuilt, which loads the SPA inside its own iframe and recurses. Fix per user's chosen direction ("run real Daily free tier in dev"): added a client guard so `useDailyCall` only mounts Daily Prebuilt for a real `*.daily.co` URL (defense-in-depth), and dev should relaunch with `.env.daily`. Daily free tier (10k participant-minutes/mo) is confirmed adequate for phase-1 free video; key validated (domain `dermaestha`).

## Context / why
User reported video joining broken for patient and doctor and asked whether Daily.co enables free phase-1 video. App running on localhost:5173 (client) + :3000 (server). ADR-43 (manual-payment pivot) removed the Daily participant webhook + `/dev/video/*` join simulator + `joinSimUrl`, but left client-side mock remnants (`useVideo.recordJoin`, `VideoRoom` `isMock` branch, `daily.mock` app-URL `roomUrl`) — stranding mock mode in the browser.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/src/modules/video/useDailyCall.js` | Modified | Added `isDailyRoomUrl()` guard; the effect now refuses to mount Daily Prebuilt for any non-`*.daily.co` URL (prevents recursive self-embed → HTTP 431). Defense-in-depth regardless of wired provider. |
| `client/test/unit/modules/video/useDailyCall.test.jsx` | Modified | Added failing-then-passing test: refuses a non-Daily room url (waits long enough that an unguarded mount would have fired). |
| `client/test/unit/modules/video/views/VideoRoom/VideoRoom.test.jsx` | Modified | Fixture `roomUrl` placeholder `'u'` → `https://x.daily.co/appt_a1` so the real-Daily mount test satisfies the new guard; added `getCallInstance` to the daily-js mock (now called by the hook). |
| `client/src/modules/video/useDailyCall.js` | Modified (2nd fix) | Duplicate-iframe + kick fix: tear down any leftover Daily instance via `getCallInstance()` before `createFrame` (kills "Duplicate DailyIframe instances are not allowed"); log the Daily `error` payload before leaving; drop `token` from effect deps so a token refetch no longer rebuilds the live call. |
| `client/src/modules/video/useVideo.js` | Modified (2nd fix + cleanup) | Pin the `video-token` query (`staleTime: Infinity`, no focus/reconnect refetch). Cleanup: removed dead `recordJoin` (`/dev/video/join` fetch); returns `{ token, detail }`. |
| `client/test/unit/modules/video/useDailyCall.test.jsx` | Modified (2nd fix) | Added 2 regression tests: token change must not rebuild the frame; a leftover instance is destroyed before createFrame. Added `getCallInstance` to the daily-js mock. |
| `client/src/modules/video/views/VideoRoom/VideoRoom.jsx` | Modified (cleanup) | Removed the dead mock branch (`isMock`/`peerJoined`/recordJoin-effect + both `{isMock && …}` blocks); now real-Daily-only. |
| `client/test/unit/modules/video/views/VideoRoom/VideoRoom.test.jsx` | Modified (cleanup) | Dropped the 4 dead mock-mode tests + `mock`/`mockMode`/`joinSimUrl` scaffolding; re-pointed the 2 leave tests to drive leave via Daily's `left-meeting` handler. |

## Dependencies / config / schema
No code/config files changed for provider selection. Runtime guidance: dev server must be relaunched with `--env-file=.env.daily` (`VIDEO_PROVIDER=daily`, real key present) to exercise real video locally. `.env` (stub) and `.env.example.dev` (mock) do not give a working in-browser call.

## Decisions
- Fix direction chosen by user: run the real Daily free tier in dev; treat `mock` as CI/unit-test-only; harden the client so a non-Daily URL can never recurse.
- Dead client mock path REMOVED (user-approved, client-only scope): deleted `useVideo.recordJoin`, and `VideoRoom`'s `isMock`/`peerJoined`/recordJoin-effect + the two `{isMock && …}` UI blocks (mock placeholder + mock Leave button); `VideoRoom` is now real-Daily-only. Server `service.js` still emits the documented `joinSimUrl: null` (harmless, client no longer reads it) — left in place to keep the cleanup doc-free (removing it would touch spec 14 §3). The `daily.mock` server adapter stays for CI/unit tests.

## Notable findings
- Active provider proven `mock` from the live `video-token` response (200 OK + mock HMAC token format in the Daily iframe URL); not stub (would 501).
- Recursion is mock-specific: real `daily` mode returns a genuine `*.daily.co` URL that Daily Prebuilt joins normally.
- Pre-existing spec/code drift (NOT introduced here): ADR-43 (doc 11) states there is no `/dev/video/*` join simulator and no `joinSimUrl`, yet the client still has `recordJoin`→`/dev/video/join` and the `isMock` render branch, and doc 12 BUG-2 still references the mock `recordJoin` path. Doc 15 §8 labels `mock` as "(dev)" though it is not in-browser joinable.
- Daily free tier = 10,000 participant-minutes/month then $0.004/min; ~166 30-min 2-party consults/month free. Architecture (SPA joins Daily directly, no media proxy) keeps platform-side cost at zero. Key validated read-only (HTTP 200, domain `dermaestha`).
- **BLOCKER discovered via real-Daily visual test:** joining a real room ends immediately with Daily error `account-missing-payment-method` (from Daily's call-ui). The `dermaestha` Daily account has no payment method on file, and Daily refuses to start meetings until one is added. The free 10k minutes are billed at $0, but a card on file appears mandatory to enable meetings at all. Not a code issue — account/billing action required in the Daily dashboard. (Could not find an official doc page for the exact error string; conclusion is from the live error event.) **RESOLVED:** user added a payment method; the live two-party call then succeeded (see Verification). Confirms Daily's free tier requires a card on file to start meetings, even though usage under 10k participant-min/mo is billed at $0.

## Second issue — kicked mid-call + "Duplicate DailyIframe instances are not allowed" (rejoin blocked)

- **Confirmed mechanism:** `@daily-co/daily-js` permits ONE call instance per page. `useDailyCall` cleanup called `frame.destroy()` without awaiting it, the effect recreated the frame on any dep change (`[enabled, roomUrl, token]`), and there was NO check for a living instance before `createFrame`. So any teardown-then-recreate raced the in-flight destroy → the duplicate error at `useDailyCall.js` createFrame line → user dropped + rejoin blocked. App runs in `React.StrictMode` (main.jsx:9); the initial mount is safe only because the async dynamic-import defers `createFrame` past the `cancelled` cleanup.
- **Most likely trigger (inferred, NOT headless-reproducible):** global `refetchOnWindowFocus:true` + no `staleTime` on the `video-token` query + the Daily adapter minting a NEW token per call → alt-tabbing between the two real browser windows refetched the token → `token` dep changed → teardown/recreate race for both parties (~the minute spent switching). Headless can't fire real OS focus events, so 3 live repro attempts stayed connected — not claimed as proven.
- **Fix:** (1) `getCallInstance()` teardown before `createFrame` (kills the duplicate class); (2) drop `token` from the effect deps; (3) pin the token query (no stale/focus/reconnect refetch); (4) log the Daily `error` payload so the exact "kicked" reason is captured next time.

## Verification
- `npx vitest run` (client): full suite **144 passed / 0 failures**, incl. new guard test and updated VideoRoom test.
- New guard test confirmed RED before the fix (createFrame called once), GREEN after.
- Live reproduction via Playwright on localhost:5173: patient and doctor both show recursive nested VideoRoom + HTTP 431 (screenshots `patient-join-broken.png`, `doctor-join-broken.png`).
- Daily key validated read-only: `GET https://api.daily.co/v1/` → 200, domain `dermaestha`.
- Real-Daily in-browser join (server started by agent on `.env.daily`, fresh seed): **recursion fix VERIFIED** — patient join shows a clean Waiting room (no nested timers, no HTTP 431), `video-token` 200, app gracefully returns to `/ready` after Daily's error. Screenshot `patient-join-daily-billing.png`.
- **Second-fix verification:** new unit tests red→green (token change no longer rebuilds the frame; leftover instance destroyed before createFrame); full client suite 145/146 (the 1 failure is `PrescriptionBuilder` — unrelated, passes in isolation; pre-existing full-suite flake). Live (HMR'd): join → focus cycle does NOT refetch the token (delta 0) → leave→rejoin x2 both re-show the Daily prejoin with ZERO duplicate errors (pre-fix the same rejoin failed with "Failed to fetch").
- **LIVE TWO-PARTY CALL VERIFIED after user added a payment method to the Daily account.** Patient joined via the app (real Daily prejoin → "Are you ready to join?" → in call); doctor joined from a fully isolated second browser context. Both connected: patient view shows the doctor as main feed (`Dr Baseline Derm`) + self-tile `Baseline Patient One (You)`; doctor view shows `2 people in call` + `Dr Baseline Derm (You)` + patient feed. Display names flow from `issueToken` end-to-end. Headless media synthesized via injected canvas/oscillator `getUserMedia` (no real devices in automation). Screenshots: `patient-daily-prejoin.png`, `patient-in-call.png`, `patient-two-party.png`, `doctor-in-call.png`.

## Risk / rollback
Low. Single-file behavioral change is purely additive (a guard that only *blocks* invalid URLs); real Daily URLs are unaffected. Revert by removing `isDailyRoomUrl` + its call and reverting the two test edits.

## Open items / next session
- Live verification DONE (real Daily, two-party call). Dev video for phase 1 = `VIDEO_PROVIDER=daily` (`.env.daily`); Daily account now has a payment method.
- Decide whether to clean up the dead client mock path (`recordJoin`/`isMock`/`joinSimUrl` + tests) — out of scope unless approved.
- Apply tracked spec doc-impact updates (15 §8 wording; optionally 11/12/14 if the mock cleanup is approved) only after code is committed and user approves.
- Commit not yet made (awaiting approval). Agent left an API server (`.env.daily`) + Vite client running on 3000/5173; one orphaned headless Daily context (doctor) may still be connected — both cleared on browser/server shutdown.
- Test artifacts added to repo root (`*-broken.png`, `*-daily-billing.png`, `patient-daily-prejoin.png`, `patient-in-call.png`, `patient-two-party.png`, `doctor-in-call.png`) — decide whether to keep or delete before commit.
