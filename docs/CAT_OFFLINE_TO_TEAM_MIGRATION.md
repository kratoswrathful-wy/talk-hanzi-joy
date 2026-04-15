# CAT Offline to Team Migration

## Team Deployment SOP (run this first)

Use this checklist when setting up a new environment or onboarding another teammate.

### Prerequisites

- TMS app can login and open `/cat/team`.
- Supabase project is linked from this repo.
- `cases.id` type is `uuid` in remote database.

### Migration order (required)

1. `supabase/migrations/20260415120000_cat_assignments.sql`
2. `supabase/migrations/20260415133000_cat_cloud_core.sql`

Reason: `cat_cloud_core` references `cat_assignments` and expects it to exist first.

### Commands

```bash
# 1) Sync CAT static bundle
node scripts/sync-cat.mjs

# 2) (Optional) check migration list
npx --yes supabase@2.91.1 migration list

# 3) Apply migrations to linked remote
npx --yes supabase@2.91.1 db query --linked -f "supabase/migrations/20260415120000_cat_assignments.sql"
npx --yes supabase@2.91.1 db query --linked -f "supabase/migrations/20260415133000_cat_cloud_core.sql"
```

### Verification SQL

```sql
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in (
    'cat_assignments',
    'cat_projects',
    'cat_files',
    'cat_segments',
    'cat_tms',
    'cat_tm_segments',
    'cat_tbs',
    'cat_workspace_notes',
    'cat_module_logs'
  )
order by table_name;
```

```sql
select data_type
from information_schema.columns
where table_schema='public'
  and table_name='cat_assignments'
  and column_name='case_id';
```

Expected:
- all `cat_*` tables exist.
- `cat_assignments.case_id` is `uuid`.

### Common failures and fixes

- `foreign key ... incompatible types text and uuid`
  - Cause: old `cat_assignments` migration used `case_id text`.
  - Fix: ensure local file is updated to `case_id uuid`, then re-run migration.
- `policy already exists`
  - Cause: migration re-run on existing table.
  - Fix: keep `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
- `password authentication failed for user cli_login_postgres`
  - Cause: linked DB credentials not available in current shell.
  - Fix: re-link/login Supabase CLI, or run SQL in Supabase Dashboard SQL Editor.

This is a one-way migration flow:
- source: `offline` mode (IndexedDB local data)
- target: `team` mode (cloud tables via Supabase RPC bridge)

## 1) Export snapshot in offline mode

1. Open CAT personal offline entry (`/cat/offline`).
2. Open browser console in the CAT iframe.
3. Run:

```js
const snapshot = await window.CatMigrationTools.exportOfflineSnapshot();
window.CatMigrationTools.downloadSnapshot(snapshot);
```

This downloads a JSON snapshot file.

## 2) Import snapshot in team mode

1. Open CAT team entry (`/cat/team`).
2. Open browser console in the CAT iframe.
3. Select the downloaded JSON and parse it:

```js
const text = await (await fetch("file:///PATH/TO/cat-offline-snapshot.json")).text();
const snapshot = JSON.parse(text);
const result = await window.CatMigrationTools.importSnapshotToTeam(snapshot);
console.log(result);
```

If `file:///` fetch is blocked by browser policy, paste the JSON object directly in console and run import.

## Notes

- Migration is one-way and non-destructive for offline data.
- Team mode writes into cloud tables (`cat_*`).
- IDs are remapped during import; project/file/TM relations are preserved through internal mapping.
