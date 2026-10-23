# Audit evidence for 7182b84

See [the project audit](../../PROJECT_AUDIT_2026-10-19.md) for interpretation, severity, limitations and the remediation plan.

- `npm-advisories.json`: normalized npm audit results, retaining installed versions, severity, fix ranges and representative dependency paths. Long repeated paths are abbreviated with their counts.
- `rust-advisories.json`: normalized Cargo audit matches and warnings, with advisory database revision. Includes optional/other-target lockfile dependencies; it is not a list of proven reachable exploits.
- `roundtrip.probe.txt` and `roundtrip-results.txt`: production Markdown parser/repair/serializer and backlink/index probes. Ten failures and one pass.
- `lifecycle.probe.txt` and `lifecycle-results.txt`: actual hook callback logic under a deliberately minimal mock hook scheduler. Five failures. Follow up with full React/native integration tests.
- `filesystem.probe.txt` and `filesystem-results.txt`: adapter tests using API doubles. Four failures. They prove missing application-level checks/path consistency, not successful native sandbox escapes or behavior on every OS.

Probe files are snapshots, not members of the normal test suite. To reproduce from the repository root, copy them to these temporary test filenames and run:

```sh
cp docs/audits/2026-10-19/roundtrip.probe.txt audit-roundtrip.probe.test.ts
cp docs/audits/2026-10-19/lifecycle.probe.txt audit-lifecycle.probe.test.ts
cp docs/audits/2026-10-19/filesystem.probe.txt audit-filesystem.probe.test.ts
node node_modules/vitest/vitest.mjs run audit-roundtrip.probe.test.ts audit-lifecycle.probe.test.ts audit-filesystem.probe.test.ts --reporter=verbose
```

At the audited commit, expect 19 failures and one pass. Remove the three temporary files after running. The existing suite, run without those copies, has 45 passing tests. For remediation, convert relevant snapshots into proper regression tests against the new public contracts rather than retaining a mocked React scheduler as long-term infrastructure.

Other checks performed:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
npm run build
cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --target-dir /tmp/folium-audit-cargo-target
cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --target-dir /tmp/folium-audit-cargo-target --all-targets -- -D warnings
pnpm audit --json
cargo audit --file src-tauri/Cargo.lock --json
```

Node: `20.20.2`; pnpm: `12.14.0`; Rust/Cargo: `1.93.1`; cargo-audit: `0.22.2`. The auditor was installed under `/tmp/folium-audit-tools`; its database is under `/tmp/folium-rustsec-db`. Audit commands exit nonzero because matches exist. No dependency upgrades or source-code fixes were made.
