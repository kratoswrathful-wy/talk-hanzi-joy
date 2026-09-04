# R1-A source matrix (recovery/p0a-20260830)
# Generated locally; unverified; not deployable.

| dest | source SHA-256 | action |
|---|---|---|
| src/lib/case-action-rpc.ts | 2834FB99FDD3823022F9FD8EB5C3931B08431B904F3F1098C50356421BF88BFA | adopted as-is; client.rpc string names; compatible with supabase-js 2.112.4 |
| src/lib/case-action-rpc.test.ts | F1F46C351D3705939CBE22A32FF1911AB97D16F8CAE126D4E1815A04CF3FC3BE | adopted as-is |
| src/lib/case-credential-access.ts | 3F13AE1F6370425CFA7848CC2239EA6523ECBF7FFC6CFF430A6401BF618FF621 | adopted as-is |
| src/lib/case-credential-access.test.ts | DBE58433C41473BC1C466BB1A246A42A1E877243786A64CFCB4EB08E0F71F17F | adopted as-is |
| src/lib/case-credential-store.ts | 27E1BEF9BC2E51574510EF6BFEC26C2B16850F75009A9CF287C620E225D87D63 | adopted as-is; clears vault on auth user change + case_change_signals |
| src/lib/case-public-snapshot.ts | C4202CF0D64226ED4ED60C658BA1656E307783F47EDF852F44B8B93888A8F4C0 | adopted as-is; newer masked snapshot wins |
| src/lib/case-public-snapshot.test.ts | 05146A8083E4401A40BC2584D68AD7F0A3222C00CD81BE5A54F34E92B477C48F | adopted as-is |
| src/data/case-types.ts revision | (surgical) | add revision:number only; do not copy whole old file |
