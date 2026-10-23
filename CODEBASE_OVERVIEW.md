# Folium — Codebase Overview

> Current repository release: 0.5.2
> Package, Cargo, and Tauri versions: 0.5.2
> Stack: Tauri v2 + React 18 + TypeScript + TipTap 3 + Tailwind CSS 3 + Vite
> Package manager: pnpm
> Active branch: `Refactored-Parser`
> Last updated: October 19, 2026

Folium is a local-first Markdown editor. Vaults remain ordinary files on disk, while the Tauri desktop shell provides filesystem access, image caching, PDF export, workspace management, and native desktop integrations.

> **Current readiness:** the first reliability and security remediation pass from the [October 19, 2026 project and safety audit](docs/PROJECT_AUDIT_2026-10-19.md) is implemented in the working tree. The reproduced Markdown, document-lifecycle, file-collision, configuration, indexing, network-boundary, and dependency failures now have code fixes and regression tests. Native WebView security tests, crash/power-loss tests, packaged cross-platform smoke tests, migration preview/rollback, accessibility, and performance work still block a release-readiness claim.

## 1. Application architecture

```text
App
└─ ErrorBoundary
   └─ SettingsProvider
      └─ ModalProvider
         └─ AppContentInner
            └─ WorkspaceProvider
               └─ EditorModeProvider
                  └─ BootloaderWrappedContent
                     └─ VaultContext.Provider
                        └─ MainLayout
                           ├─ Sidebar / FileTree
                           ├─ TabBar
                           ├─ Main Editor pane
                           ├─ Optional split Editor pane
                           ├─ GraphView tab
                           ├─ StatusBar
                           └─ ModalRoot
```

### Provider responsibilities

- `SettingsProvider` loads and persists theme, font-size, and typewriter-blur preferences.
- `ModalProvider` owns global modal, context-menu, toast, and move/rename state.
- `WorkspaceProvider` manages recent vaults, active workspace selection, workspace identity, and boot transitions.
- `EditorModeProvider` owns Focus Mode and Typewriter Mode so those states do not need to be drilled through the bootloader/layout hierarchy.
- `VaultContext` exposes the active vault, note index, backlink index, filesystem API, and wikilink navigation.

## 2. Runtime and state layers

### UI

- `src/App.tsx` wires providers, bootstrapping, the two editor instances, file operations, and global shortcuts.
- `src/components/MainLayout.tsx` owns the responsive shell, sidebar, tab bar, graph tab, split-pane sizing, focus-mode visibility, and status bar.
- `src/components/ModalRoot.tsx` renders quick switcher, context menus, rename/move/settings modals, and toasts.
- `src/components/GraphView.tsx` renders the vault graph using `react-force-graph-2d`.

### Domain hooks

- `useTabs.ts` is the canonical tab state machine for main and split panes.
- `useFileSystem.ts` owns vault loading, directory scanning, note/backlink indexing, transactional backlink updates during rename, file operations, editor-state persistence, and image-path registration. Its `refreshVault()` helper keeps tree/index/cache state synchronized after mutations, including a recursive image scan for Tauri vaults so bare Obsidian image names can resolve into `assets/`, `attachments/`, or other vault folders.
- `useFileOperations.ts` provides note/folder creation, rename, move, delete, wikilink navigation, split opening, and PDF export.
- `useEditorState.ts` handles generation-safe hydration, tab switching, debounced serialization, cursor/scroll restoration, conflict-aware saving, draft recovery, and reload behavior. There is no general external-file watcher in this branch.
- `src/lib/documentSessions.ts` owns path-keyed baselines, drafts, dirty/version state, per-document ordered save queues, recovery storage, and subscriptions shared by the main and split panes.
- `useAppBootloader.ts` restores the active workspace and handles first-run onboarding.

### Filesystem adapters

`src/lib/fs/` provides a common adapter interface with:

- `tauriAdapter.ts` for desktop filesystem access, exclusive/no-clobber mutations, native vault approval, and atomic text replacement.
- `browserAdapter.ts` for browser-compatible file access.
- `vaultIndexer.ts` for bounded note discovery, canonical note identities, code-aware wikilink extraction, backlink construction, resolution, and target rewriting.

The Tauri adapter exposes an additional image scan that is intentionally separate from the visible note tree: image files are indexed for lookup without appearing as notes in the sidebar.

## 3. Markdown and editor pipeline

### TipTap extension registry

`src/lib/editor/extensions.ts` composes the editor from TipTap and Folium extensions:

- Markdown, tables, task lists, typography, links, code blocks, highlights, and placeholders.
- Wikilinks, tags, callouts, frontmatter, embeds, Obsidian images, inline math, and block math.
- Slash commands, Markdown paste, typewriter mode, smooth caret behavior, and code-copy actions.

### Loading

Notes are read from disk and parsed by `@tiptap/markdown` through the editor’s Markdown content type. The custom tokenizers supplied by Folium extensions are therefore part of the production loading path. Math supports inline and display delimiters, including Obsidian’s common display-math layouts. A post-parse compatibility pass in `useEditorState.ts` repairs literal `$...$` and `$$...$$` text left behind by platform-specific WebView/Marked behavior, particularly on macOS.

### Saving

TipTap JSON is serialized by `tipTapToMarkdown()` in `src/lib/markdown.ts`. Reference-style link definitions are captured and restored around serialization. Inline math, dollar-containing code, literal Markdown punctuation, ordered-list starts, variable code delimiters, table pipes, and table alignment are covered by production-pipeline regression tests. Autosaves operate through path-keyed document sessions, compare the on-disk file with their baseline, preserve failed/conflicting drafts, and serialize writes per document.

The legacy exported `markdownToTipTap()` helper remains in `src/lib/markdown.ts` for compatibility coverage, but production loading uses `@tiptap/markdown`.

`MathBlockNodeView` renders display math with KaTeX and normalizes a lone trailing backslash tolerated by Obsidian’s MathJax. `InlineMathNodeView` renders inline math with the same KaTeX dependency.

When adding Markdown behavior, update both the relevant TipTap tokenizer/parser and the serializer, then add a focused test.

## 4. Core features

- Local Markdown vaults with nested folders and backlink indexing.
- Main and split editor panes with in-memory tabs; tab sessions are not persisted across restarts.
- Wikilinks, aliases, anchors, embeds, tags, callouts, frontmatter, tables, task lists, and math.
- Graph View represented by the sentinel tab ID `GRAPH_TAB_ID`.
- Attachment ingestion and image caching through `imageIngestion.ts` and `imageCache.ts`. Pasted/dropped external images are copied into `attachments/`; existing vault images are resolved from any vault-relative folder, with basename lookup for Obsidian links that omit the folder. Raster images are cached as WebP through the Rust Tauri command layer and cache updates are pushed back into image node views.
- PDF export through `pdfExport.ts`, `html2canvas`, and `jspdf`.
- Heuristic corruption warnings, pre-write external-file-change checks, local recovery drafts, ordered saves, and flushes before close or file mutation.
- Workspace history and onboarding.
- Focus Mode and Typewriter Mode through `EditorModeContext`. Focus Mode reveals the hidden chrome only after a deliberate 60 px left-edge dwell (100 ms); Typewriter Mode centers a collapsed caret while avoiding scroll changes during drag/double-click selections. Linux uses a mask-based typewriter fade fallback, while macOS and Windows use the backdrop-blur overlay.

## 5. Sync work status

The current `Refactored-Parser` branch does not contain the sync implementation. Experimental sync work is preserved in the separate `feature/sync-yjs-core` branch and its locally recorded remote-tracking ref. It includes Yjs, watchers, pairing UI, and Syncthing sidecars, but was not runtime-audited here. See the current audit for the branch inventory and integration prerequisites.

## 6. Testing and build verification

- Tests live primarily under `src/lib/__tests__/` and `src/extensions/__tests__/`.
- `npm test` / `pnpm test` runs Vitest.
- Current verification status: 74 tests passing across 10 test files.
- TypeScript project validation and the Vite production build pass.
- CI and release workflows pin Node 22, pnpm 12.14, and Rust 1.90; installs and Rust commands use their lockfiles.
- Linux `cargo fmt --check`, `cargo check --locked`, and `cargo clippy --locked --all-targets --all-features -- -D warnings` pass.
- `cargo test --locked` passes two native network-boundary tests covering public, private, reserved, and IPv4-mapped address handling.
- The audit's preservation/lifecycle/adapter probes were converted into permanent production-path regression tests where the remediation was implemented. Original evidence remains in `docs/audits/2026-10-19/`.
- `pnpm audit --prod` reports no known vulnerabilities. The Rust lockfile was refreshed past every vulnerable version recorded by the baseline RustSec scan; CI and release run Rust audit checks because `cargo-audit` is not installed in this local environment.

The parser tests use `MarkdownManager` directly, avoiding a browser-DOM dependency while still exercising the production TipTap Markdown tokenizer registry.

## 7. Repository organization

- `docs/archive/` contains historical PRDs, comparisons, and debugging notes.
- `scripts/legacy/` contains retained ad-hoc diagnostic scripts.
- `CODE_AUDIT.md` preserves the April audit; `docs/PROJECT_AUDIT_2026-10-19.md` contains the current findings, all 24 prior-item statuses, and the remediation plan.
- `pnpm-lock.yaml` is the canonical dependency lockfile; the obsolete npm lockfile has been removed.
- `Dockerfile` builds the container used by the Podman-based `build-appimage.sh`.

## 8. Known follow-up work

1. Exercise the native security boundary in real WebViews on Windows, macOS, and Linux, including hostile paste, out-of-scope paths, symlink escapes, CSP compatibility, and packaged-app smoke tests.
2. Add crash/power-loss save recovery tests and migration preview/rollback UI before running image migration against valuable vaults.
3. Complete the remaining accessibility, cache cancellation/retention, source-mode handling for unsupported Markdown, and performance/bundle work in the audit.
4. Remove the legacy parser only after compatibility fixtures cover the complete production parse/save path; continue typing the remaining editor boundaries and lazy-loading optional bundles.
5. Keep sync work deferred until the reliability release exit criteria are met and its authoritative-storage model is reconciled with Folium's plain-file contract.
