# CLAUDE.md

## RULES YOU MUST FOLLOW (RULES CAN ONLY BE EDITED BY HUMANS)

### Skills

- After you fully understand the request, recommend the best-fit skill(s) for the task and let the user choose whether to use them.
- Before activating any skill, STOP: tell the user which skill you are about to use and why, and let them decline. Never activate a skill silently.
- If the user proposes a skill that does not fit the current task, tell them it is unsuitable before doing anything else.

### Specs

- At the START of any task, read `docs/specification/00-INDEX_AND_GOVERNANCE.md` first. Treat it as the authoritative source of project context and specifications.
- Treat the documentation suite `docs/specification/` files `00`–`15` as the SOLE source of truth.
- As you work, actively check after each change whether it requires updates to any file in `docs/specification/` (`00`–`15`). This check is mandatory — DO NOT SKIP it.
- Before editing any spec, follow the change protocol and change-impact matrix defined in `docs/specification/00-INDEX_AND_GOVERNANCE.md`.
- Before making any spec change, list your proposed updates to the user and wait for their explicit approval. Do not edit until approved.

### Agent Logs

- Maintain exactly ONE combined change log per working session, in `agentChangeLogs/`:
  - Create it by copying `agentChangeLogs/_TEMPLATE.md`.
  - Name it `${YYYY-MM-DD-HHmm}-${kebab-session-name}.md` (ISO date + 24-hour time first so files sort chronologically; no colon, to stay Windows-safe).
  - Update it AS YOU MAKE CHANGES — not only at the end.
  - Follow the template's section order EXACTLY. Keep every section; if a section is empty, write "None" / "N/A" / "Not verified" — never omit a section.
  - This one document holds both the narrative (status, goal, context, decisions, findings, verification, next steps) AND the file-level change table (each file changed + the reason).
- Keep `agentChangeLogs/index.md` current: one line per session, newest last, formatted as `${YYYY-MM-DD-HHmm}-${kebab-session-name}: <one-line summary>`.
- One session = one changelog. When you dispatch subagents for a multi-document or multi-file task:
  - YOU (the controller) own the single session changelog and its `agentChangeLogs/index.md` entry.
  - Subagents must NOT create per-task changelog files and must NOT edit anything under `agentChangeLogs/`.
  - Instruct subagents about this explicitly in their task — otherwise they will infer the CLAUDE.md changelog rule on their own and fragment the log.

### Actions — require approval, STOP and ask first

- Do NOT `git push`. Stop, clearly tell the user, and wait for their approval.
- Do NOT perform any deployment action. Stop, clearly tell the user, and wait for their approval.
- Do NOT create a new branch. Stop, clearly tell the user, and wait for their approval.

## Behavioral guidelines

**Tradeoff:** These guidelines bias toward caution over speed.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. Accuracy and verification

- Do not guess. If you don't know something or can't verify it, say so plainly:
  "I don't know" or "I can't confirm this from what I have access to."
- Ground claims about this codebase in what you've actually read. Before
  stating how something works, open the relevant file and confirm. Do not
  describe functions, configs, or APIs from memory.
- Before using any library, function, or flag, verify it exists (check the
  file, the package, or run --help). Never invent API methods, CLI flags,
  config keys, or file paths.
- Distinguish clearly between what you know and what you're inferring. Mark
  inferences as inferences: "I'm assuming X — confirm before I proceed."

### 6. Don't assume the user is correct

- Treat my statements as claims to verify, not facts. If I say "the bug is in
  function X" or "we use library Y," check before acting on it.
- If what I've said conflicts with what you find in the code, the docs, or the
  error output, tell me directly. Don't quietly reconcile the contradiction in
  my favor.
- If a request rests on a premise that looks wrong, flag it before doing the
  work: "You said A, but the code shows B — which should I go with?"
- Prefer asking one clarifying question over proceeding on a shaky assumption.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
