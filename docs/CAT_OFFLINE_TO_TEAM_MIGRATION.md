# CAT Offline to Team Migration

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
