# 2026-07-02-2324 — doctor-photo-display-fixes

**Status:** Completed
**Goal:** Fix two doctor profile-photo display bugs — (1) uploaded photo not visible to patients browsing, (2) current/selected photo not shown in the admin edit-doctor form.
**Skill(s) used:** superpowers:systematic-debugging (user opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (pending user approval)
**Last updated:** 2026-07-02-2324
**Tags:** #bugfix

## Summary
Two separate root causes behind "doctor photos don't show". (1) In dev, the Vite dev server only proxied `/api` and `/dev` to Express, not `/uploads`, so `<img src="/uploads/...">` requests fell through to the SPA index.html and never loaded — added `/uploads` to the dev proxy. (2) `DoctorForm` never rendered any `<img>`, so the existing photo (available as `initial.photoUrl` in edit mode) and a newly-selected file were invisible — added a preview image that shows the selected file (object URL) or falls back to the existing photo.

## Context / why
User reported: uploaded doctor images don't appear when a patient browses doctors; and after that was fixed, the selected/uploaded photo doesn't appear in the admin edit-doctor form. Both surfaced during manual use in the dev (Vite + Express split-origin) setup.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/vite.config.js` | Modified | Added `'/uploads': 'http://localhost:3000'` to the dev proxy so patient-facing `<img src="/uploads/...">` resolves to Express in dev (prod already same-origin). |
| `client/src/modules/admin/components/DoctorForm/DoctorForm.jsx` | Modified | Added a photo preview: `useEffect` builds/revokes an object URL for the selected file; `shownPhoto = previewUrl ?? initial.photoUrl` renders an `<img>` above the file input (shows current photo in edit mode + live preview of a new selection). |
| `client/test/unit/modules/admin/components/DoctorForm/DoctorForm.test.jsx` | Modified | Stubbed `URL.createObjectURL/revokeObjectURL` (jsdom lacks them; house pattern) with cleanup-before-unstub; added a test asserting edit mode shows the existing photo and swaps to the selected-file preview. |
| `client/test/unit/modules/admin/views/AdminDoctors/AdminDoctors.test.jsx` | Modified | Added the same `URL` stub (its photo-upload test selects a file, which now triggers the preview effect). |

## Dependencies / config / schema
None. (Vite dev proxy is dev tooling, not a spec-tracked env var/tunable.)

## Decisions
- Preview uses `URL.createObjectURL` with effect-cleanup `revokeObjectURL` to avoid blob leaks on repeated selection — clean cross-env behavior; jsdom gap covered by stubbing in the two affected test files (matches the existing PrescriptionView test pattern).
- Did NOT treat the `/uploads` dev-proxy addition as a spec change: the specs do not document the Vite dev proxy at all (`/api`, `/dev` are already undocumented there), so it is consistent dev tooling.

## Notable findings
- Upload/persist path was already correct end to end (multipart → magic-byte sniff → `UPLOADS_DIR/doctors/{id}.{ext}` → DB `photoUrl` → returned by both listing and profile endpoints). Both bugs were purely display-side.
- The edit form always had `initial.photoUrl` available (via `toAdminRow`), it just was never rendered.

## Verification
- `npx vitest run test/unit/modules/admin/components/DoctorForm/DoctorForm.test.jsx` → 5/5 pass.
- `npx vitest run test/unit/modules/admin` → 37/37 pass.
- Full client suite `npx vitest run` → 153/153 pass.
- `/uploads` proxy fix confirmed working by the user in the running app.

## Risk / rollback
Low. Presentation + dev-tooling only; no server, schema, or API change. Revert the four files to undo.

## Open items / next session
- Spec doc-impact: design doc 06 §231–233 (Doctor profile-photo upload, A-01) describes the upload but not the current-photo/preview display. Tracked for end-of-task approval (per CLAUDE.md, applied only after code is committed + user approval).
- Commit pending user approval.
