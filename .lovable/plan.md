

## Plan: Three Fixes

### 1. Case Duplication — Title Date Not Updating

**Root Cause**: The `duplicate` function in `src/stores/case-store.ts` correctly computes `baseTitle` with today's date and passes it to `create()`. However, the regex `^(.*?)(\d{6})(_.+)?$` drops any suffix after the date (e.g. `_作業`). The dialog shows the correct title from `result.newCase.title`, but a poll/realtime reload may overwrite the newly created record before the page renders, or there may be a race between the optimistic insert and the navigation.

**Fix**: 
- In `src/stores/case-store.ts` `duplicate()` function, preserve the suffix after the 6-digit date when building `baseTitle`. Change line 407 to include `dateMatch[3] || ""` (the captured suffix).
- Update the pattern matching (line 410) to also account for the suffix when finding existing cases.
- Ensure the `create()` call's returned title propagates correctly by also protecting the newly created case from poll overwrites (add to `pendingUpdates`).

**Files**: `src/stores/case-store.ts`

---

### 2. Client Invoice Currency — Auto-Set to Client's Currency

**Current behavior**: The `recordCurrency` field defaults to `"TWD"` and requires manual selection. The user wants it to automatically reflect the client's configured currency.

**Fix**:
- In `src/stores/client-invoice-store.ts` `createInvoice()`, look up the client's currency from the select-options store and set `recordCurrency` on creation.
- In `src/pages/ClientInvoiceDetailPage.tsx`, when the invoice is not record-only, derive the display currency from the client's settings (via `clientOptions`) instead of from `invoice.recordCurrency`. Update `recordCur` to always use the client's currency setting.
- Remove or simplify the manual currency selector in the record-only dialog since it should default to the client's currency.

**Files**: `src/stores/client-invoice-store.ts`, `src/pages/ClientInvoiceDetailPage.tsx`

---

### 3. Filter/Sort Value Input Auto-Focus

**Current behavior**: When a filter condition row renders with a text-type field, the value input does not auto-focus. The user wants it to focus and select existing content when an existing condition is opened/visible.

**Fix**:
- In `src/components/fees/FilterSortToolbar.tsx`, in the `FilterRow` component, add a `ref` to the text `<Input>` element (line 707) and use `useEffect` or `autoFocus` + the existing `onFocus` handler (which already calls `e.target.select()` from the `Input` component) to auto-focus when the filter row is rendered/opened.
- Since the `Input` component already selects all text on focus (line 17 of `input.tsx`), simply adding `autoFocus` to the value Input should suffice.

**Files**: `src/components/fees/FilterSortToolbar.tsx`

