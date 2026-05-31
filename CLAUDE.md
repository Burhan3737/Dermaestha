# CLAUDE.md

## Module Context
Refer to ModuleContext.md @ /moduleContext/index.md ONLY if working on that module

## Project Context
Refer to ProjectContext.md ONLY if required

## RULES YOU MUST FOLLOW (THIS PART CAN ONLY BE EDITED BY HUMANS)

- ONLY IF you are activating a skill ALWAYS inform the user about it and give them an option to opt out of it/
- After completing a plan, give a brief list of changes to the human developer or a summary of the plan as well. It's tiring to read the whole plan
- After any session, if there's something new you learned about the project (rules, developer SOPs, file structure) and you would need it for future sessions add it under the Project Context heading in the relevant section (frontend, server, iOSApp, kotlinApp) after getting it reviewed by the human developer (i.e. we wrap CRUD function around frontend components to manage redux state)
- If you have worked on a module with a human developer add or update its context under the Module Context section under its own heading after approval from the human developer
- Any changes to the CLAUDE.md file must be communicated to the human developer
- Maintain a **single combined change log per working session** in the `agentChangeLogs/` folder. Create it as `${YYYY-MM-DD-HHmm}-${kebab-session-name}.md` (ISO date + 24-hour time first so files sort chronologically; no colon — Windows-safe) by copying `agentChangeLogs/_TEMPLATE.md`, and **update it as you make changes — not only at the end**. Follow the template's section order **exactly**: keep every section, writing "None"/"N/A"/"Not verified" rather than omitting one. A single doc covers both the narrative (status, goal, context, decisions, findings, verification, next steps) and the file-level change table (each file changed + the reason).
- Keep `agentChangeLogs/index.md` current with one line per session, newest last, in the format `${YYYY-MM-DD-HHmm}-${kebab-session-name}: <one-line summary>`.


## Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

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

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.