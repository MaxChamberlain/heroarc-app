---
name: add-agent-tool
description: Add or change a tool that Coach (and later the MCP/REST agents) can use, in apps/api/src/agent. Covers choosing the kind (read / log / change / app), the zod schema and description, the implementation with an Undo record, the confirmation gate for changes, the scripted test model, and tests.
---

# Add an agent tool

Read "Coach and agent tools" in AGENTS.md first.

## 1. Pick the kind

| Kind | Use for | Behaviour |
|---|---|---|
| `read` | Looking at data | No side effects. Return compact JSON. |
| `log` | Adding something new (an entry, a note) | Applied at once; records an action with an Undo; the user sees a receipt. |
| `change` | Editing or deleting existing data, goals, habits, the plan, the dashboard | **Only proposed.** The user taps Apply; then it can be undone. |
| `app` | Doing something in the app (show a day, open a card) | Nothing stored; the web app handles the `app` event. |

If a model could lose or overwrite something the user made, it is a `change`. Never make it a `log`.

## 2. Define it (`apps/api/src/agent/tools.ts`)

- Add an entry to `TOOLS`:
  - `name` (snake_case, same as the key)
  - `kind`
  - `status` (what the app shows while it runs)
  - `description`
  - `input`: a `z.object`
- Write the description for the model. Say:
  - what it does
  - when to use it
  - what to look up first (e.g. "find the id with get_day")
  - the defaults (e.g. "defaults to today")
- Keep the order of `TOOLS` stable. The tool list is part of the cached prompt prefix.
- **Outside agents get it too** (REST, the OpenAPI document, MCP), unless it's an `app` tool or you set
  `coachOnly: true` (for things only Coach should touch, like its own notes). Ask: is it safe for a script
  someone wired up in n8n? Their `change` calls wait in Settings → Agent activity, like Coach's.
- Never let a tool read `daily_metrics` or the snapshot: Oura data must not reach any model
  (`agent/no-wearables.test.ts` fails if it does).

## 3. Implement it (`apps/api/src/agent/agent.service.ts`)

- **read / app:** a case in `exec()`.
- **log:** a case in `log()`. Do the write inside the transaction you're given, and return:
  - `{ summary, undo }`: one human line (it becomes the receipt)
  - an `Undo` that reverses it exactly

  Add a new `Undo` op if none fits, and handle it in `applyUndo()`.
- **change:**
  - Describe the proposal in `describe()`: validate that the target exists, and show before → after.
  - Apply it in `applyChange()`. Re-read the current state there: the user may confirm much later.
  - Return the `Undo`.
- Throw `ToolInputError` for anything the model got wrong. The message goes back to the model.
- Set what refreshes in the app with `CHANGES` (data / layout / notes). The default is `data`.

## 4. Teach the test model (optional, `apps/api/src/coach/fake-model.ts`)

To cover the tool end to end without Claude, add a phrase to the scripted model.

## 5. Test

- `apps/api/src/agent/tools.test.ts`: the input schema accepts and rejects what it should, and the kind
  list for `change` is updated.
- `e2e/tests/coach.spec.ts` (with the scripted model):
  - the receipt appears
  - the data changes, checked through the API
  - Undo (or Apply / Cancel for changes) works
- Run `pnpm verify`.
