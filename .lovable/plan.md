

## Plan: Fix Tool Field Loss, Template Sorting, Decline Clear Button, Title Width

### Issue 1: Tool field values disappearing (Root Cause Found)

**Root cause**: In `case-store.ts`, `pendingUpdates.set(id, partial)` **replaces** the entire pending entry for a case. When two rapid saves happen (e.g., save tool fields → then toggle a checkbox), the second call overwrites `pendingUpdates` with only `{ internalNoteForm: true }`, losing the `{ tools: [...] }` entry. When the first DB write completes, `pendingUpdates.delete(id)` removes everything. If a poll/realtime event arrives in between, it sees stale `tools` from the DB.

**Fix in `case-store.ts`**:
- Change `pendingUpdates.set(id, partial)` to **merge** with existing pending: `pendingUpdates.set(id, { ...pendingUpdates.get(id), ...partial })`
- Track pending writes with a **counter** per case ID. Only delete the pending entry when all in-flight writes for that case have completed (not on the first completion).

### Issue 2: Template sorting (alphabetical by tool name, then template name)

**Current**: `tool-template-store.ts` sorts by tool's manual drag-order position via `getSortedOptions("tool")`.

**Fix**: Change sorting to use `a.tool.localeCompare(b.tool, ...)` for alphabetical tool name, then `a.name.localeCompare(b.name, ...)` for template name.

### Issue 3: Clear all decline records button

**In `CaseDetailPage.tsx`**, add a button next to the "無法承接紀錄" header when `status === "dispatched"` and user is PM+. Clicking clears `declineRecords` to `[]`.

### Issue 4: Title display width

**Current**: `pr-40` (160px right padding) on the flex container (line 1340) reserves space for the icon uploader button but is too much.

**Fix**: Reduce to `pr-12` (~48px, enough for the small uploader button) so the title can extend further right as shown in the screenshot.

### Files to Edit

| File | Change |
|------|--------|
| `src/stores/case-store.ts` | Merge pending updates instead of replacing; use write counter for safe deletion |
| `src/stores/tool-template-store.ts` | Sort templates alphabetically by tool name, then template name |
| `src/pages/CaseDetailPage.tsx` | Add "清除全部" button on decline records when dispatched + PM; reduce `pr-40` to `pr-12` |

