# Sync Implementation Tracker

Reference PRD: [sync_implementation_prd_.md](./sync_implementation_prd_.md)  
Last Updated: 2026-04-11

## Git Setup

- Integration branch created: `feature/sync-crdt-syncthing`
- Sub-branches created:
  - `feature/sync-yjs-core` (current working branch)
  - `feature/sync-syncthing-desktop`
  - `feature/sync-syncthing-android`
  - `feature/sync-pairing-ui`
  - `feature/sync-heartbeat`
  - `feature/sync-compaction`
- Note: Existing unrelated local change detected in `CODEBASE_OVERVIEW.md` and left untouched.

## Phase Status Overview

| Phase | Status | Scope | Notes |
|---|---|---|---|
| Phase 1 — Internal (Desktop) | Complete (Host-Validated) | Feature flag + sync scaffolding + desktop safety baseline | Linux runtime startup validated; macOS/Windows binaries validated by artifact type/signature |
| Phase 2 — Desktop Beta | Not Started | Desktop hardening and profiling | Blocked on Phase 1 completion |
| Phase 3 — Android Beta | Not Started | Android sync runtime + compatibility matrix | Requires Android Tauri build path when sync testing starts |
| Phase 4 — GA | Not Started | Default enable + release hardening | Depends on all prior phases |

## Phase 1 — Internal (In Progress)

### Completed

- Added runtime flag resolver at `src/config/flags.ts`:
  - `VITE_FOLIUM_SYNC_ENABLED=true` OR local config `sync.enabled=true` enables sync runtime.
- Created sync module scaffold under `src/sync/`:
  - `SyncManager.ts`
  - `bootstrap.ts`
  - `types.ts`
  - `index.ts`
- Added Phase 1 CRDT storage foundation:
  - `src/sync/YjsVault.ts` for `.md` ↔ `.yjs` document handling via Yjs V2 updates.
  - `src/sync/atomicWrite.ts` for atomic sync file writes (`.tmp` + rename).
  - `src/sync/bootstrap.ts` now exposes runtime-state check helpers.
- Added startup cleanup for orphaned sync temp files:
  - `src/sync/startupCleanup.ts`
  - Invoked from sync initialization path in `src/sync/bootstrap.ts`
- Implemented desktop Syncthing sidecar lifecycle foundation:
  - Frontend manager: `src/sync/SyncthingDesktopManager.ts`
  - Sync manager lifecycle + health/restart window: `src/sync/SyncManager.ts`
  - Tauri commands in `src-tauri/src/lib.rs`:
    - `start_syncthing_sidecar`
    - `syncthing_sidecar_status`
    - `stop_syncthing_sidecar`
  - Added `libc` dependency for Unix `SIGTERM` handling in `src-tauri/Cargo.toml`
- Added desktop bundle resource path for Syncthing binaries:
  - `src-tauri/tauri.conf.json` now includes `resources/bin/*`
  - Created `src-tauri/resources/bin/.gitkeep` placeholder for binary drop-in
  - Added `src-tauri/resources/bin/README.md` with expected binary filenames
- Added real Syncthing v1.27.0 binaries to `src-tauri/resources/bin/`:
  - `syncthing-darwin-amd64`
  - `syncthing-darwin-arm64`
  - `syncthing-linux-amd64`
  - `syncthing-linux-arm64`
  - `syncthing-windows-amd64.exe`
- Per-OS startup validation notes:
  - Linux (`x86_64`) runtime startup smoke test passed: sidecar start, API ping (`/rest/system/ping`), graceful stop.
  - macOS/Windows startup execution cannot be run on this Linux host; binaries validated via executable format checks and SHA-256 fingerprints.
  - SHA-256:
    - darwin-amd64: `41211e8fb6be8bd8ac5db958044f7ec75fe0ff702f885f75cd271b29fc086c70`
    - darwin-arm64: `894eacf2e650309522e8c5447449c9f3d17638e95b29e91e9dbc089698b60df4`
    - linux-amd64: `673d59d7431f41528e03680b7e886576ebaf641a51aa524f7b6b9857a70b4dbc`
    - linux-arm64: `ec2b0bec948415f20b5662ad00d629d428dcfd3228536d2b19e62aefa6d279db`
    - windows-amd64: `b3a63470c9824ddba4d45e18673480a8c420e612386c957a5fd66b898b227e89`
- Integrated editor save paths with `.yjs` sidecar writes when sync runtime is active:
  - `src/hooks/useEditorState.ts`
- Added initial receive-side hydration behavior:
  - When sync runtime is active and `.yjs` exists, editor hydration now prefers CRDT content.
  - Implemented in `src/hooks/useEditorState.ts` via `yjsVault.readNote(...)`.
- Added active-note receive watcher (Phase 1 baseline):
  - Polls for external `.yjs` changes while a note is open.
  - Applies remote CRDT content into editor, preserves cursor when possible, shows a sync toast.
  - Re-serializes updated content back to `.md` to keep markdown as derived output.
  - Implemented in `src/hooks/useEditorState.ts`.
- Added vault-wide sync watcher + conflict interception:
  - `src/sync/VaultSyncWatcher.ts` scans vault for `.yjs` changes and updates paired `.md` files.
  - Intercepts `*.sync-conflict-*` `.yjs` files, performs `Y.mergeUpdates`, applies sanity checks, and logs outcomes to `.vault-sync/compaction/merge_log.jsonl`.
  - Wired into `SyncManager` lifecycle so watcher starts/stops with sync runtime.
- Wired lazy sync lifecycle into vault boot/switch paths:
  - `src/hooks/useAppBootloader.ts`
  - `src/contexts/WorkspaceContext.tsx`
- Verified compile/build after scaffolding changes (`npm run build` passes).
- Verified Rust backend compiles with sidecar commands (`cargo check` in `src-tauri` passes).
- Added `yjs` dependency to app package manifest for CRDT encoding/decoding.
- Added initial sync unit tests:
  - `src/sync/__tests__/flags.test.ts`
  - `src/sync/__tests__/startupCleanup.test.ts`
  - `src/sync/__tests__/syncManager.test.ts`
  - `src/sync/__tests__/atomicWrite.test.ts`
  - Ran: `npx vitest run src/sync/__tests__/flags.test.ts src/sync/__tests__/startupCleanup.test.ts src/sync/__tests__/syncManager.test.ts src/sync/__tests__/atomicWrite.test.ts` (pass)
- Current behavior:
  - Sync runtime remains off by default.
  - Sync runtime only initializes when flag resolves true and a vault is active.
  - Switching or removing active vault updates sync runtime lifecycle.
  - Sidecar startup/shutdown failures degrade gracefully (app continues; error retained in sync status).

### Remaining (Phase 1)

- None on this host environment.

## Phase 2 — Desktop Beta (Pending)

- Expand desktop platform coverage and large-vault profiling.
- Add advanced failure visibility (sync error badge/log pathways).
- Run regression suite with `FOLIUM_SYNC_ENABLED=true` and `false`.

## Phase 3 — Android Beta (Pending)

- Implement Android-specific Syncthing embedding path from PRD section 7.
- Build Android Tauri target for sync validation (explicitly required once Android sync work starts).
- Validate:
  - Foreground service persistence
  - Reboot recovery
  - Battery optimization prompts/behavior across OEMs

## Phase 4 — GA (Pending)

- Flip default feature flag behavior to enabled.
- Finalize docs and user-facing copy ("sync", never "Syncthing").
- Publish internal support runbook for edge-case troubleshooting.
