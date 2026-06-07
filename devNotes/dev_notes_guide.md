IF you are an AI agent you DO NOT need to keep this file in your context. These guidelines are for HUMANS ONLY.

### Purpose
- Devs review the code written by AI agents and ensure that agents follow the project rules as defined in spec docs and keeping them in sync with the code written by AI agents.

### Filename Guidelines
- ${date(format(mm_dd_yyyy_hh_mm))}_${notesTitle}

### Reviewer Guidelines
- As a human reviewing AI code you should ALWAYS write these notes after the AI agent ships a new feature
- Dev notes act as a critique loop for the AI agent. Its always best to keep yourself in the loop
- Before writing these notes you should read the specs, relevant code changes and agentChangeLogs
- Make sure to provide authentic information otherwise the agent might take your notes as the ground truth (even if it's incorrect)
- Make AI agents regret what they have written (if its not consistent with spec docs)
