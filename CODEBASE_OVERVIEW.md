# Folium — Codebase Overview

> Current repository release: 0.5.1
> Package manifest version: 0.4.5 (version metadata still needs alignment)
> Stack: Tauri v2 + React 18 + TypeScript + TipTap 3 + Tailwind CSS 3 + Vite
> Package manager: pnpm
> Last updated: July 28, 2026

Folium is a local-first Markdown editor. Vaults remain ordinary files on disk, while the Tauri desktop shell provides filesystem access, image caching, PDF export, workspace management, and native desktop integrations.

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
- `useFileSystem.ts` owns vault loading, directory scanning, note/backlink indexing, file operations, editor-state persistence, and image-path registration. Its `refreshVault()` helper keeps tree/index/cache state synchronized after mutations.
- `useFileOperations.ts` provides note/folder creation, rename, move, delete, wikilink navigation, split opening, and PDF export.
- `useEditorState.ts` handles editor hydration, tab switching, cursor/scroll restoration, corruption detection, external-change detection, and reload behavior.
- `useEditorAutoSave.ts` contains debounced Markdown serialization, external-change protection, and save error reporting.
- `useAppBootloader.ts` restores the active workspace and handles first-run onboarding.

### Filesystem adapters

`src/lib/fs/` provides a common adapter interface with:

- `tauriAdapter.ts` for desktop filesystem access and dynamic Tauri scope grants.
- `browserAdapter.ts` for browser-compatible file access.
- `vaultIndexer.ts` for note discovery, wikilink extraction, and backlink construction.

## 3. Markdown and editor pipeline

### TipTap extension registry

`src/lib/editor/extensions.ts` composes the editor from TipTap and Folium extensions:

- Markdown, tables, task lists, typography, links, code blocks, highlights, and placeholders.
- Wikilinks, tags, callouts, frontmatter, embeds, Obsidian images, inline math, and block math.
- Slash commands, Markdown paste, typewriter mode, smooth caret behavior, and code-copy actions.

### Loading

Notes are read from disk and parsed by `@tiptap/markdown` through the editor’s Markdown content type. The custom tokenizers supplied by Folium extensions are therefore part of the production loading path.

### Saving

TipTap JSON is serialized by `tipTapToMarkdown()` in `src/lib/markdown.ts`. Reference-style link definitions are preserved and restored around serialization. Autosaves are debounced and stopped when the on-disk file changes externally.

The legacy exported `markdownToTipTap()` helper remains in `src/lib/markdown.ts` for compatibility coverage, but production loading uses `@tiptap/markdown`.

When adding Markdown behavior, update both the relevant TipTap tokenizer/parser and the serializer, then add a focused test.

## 4. Core features

- Local Markdown vaults with nested folders and backlink indexing.
- Main and split editor panes with persistent tabs.
- Wikilinks, aliases, anchors, embeds, tags, callouts, frontmatter, tables, task lists, and math.
- Graph View represented by the sentinel tab ID `GRAPH_TAB_ID`.
- Attachment ingestion and image caching through `imageIngestion.ts` and `imageCache.ts`.
- PDF export through `pdfExport.ts`, `html2canvas`, and `jspdf`.
- Corruption warnings and external-file-change protection.
- Workspace history and onboarding.
- Focus Mode and Typewriter Mode through `EditorModeContext`.

## 5. Sync work status

The current `Refactored-Parser` branch does not contain the sync implementation. The active sync work is preserved in the separate local/remote branch `feature/sync-yjs-core`. The obsolete sync branches without unique commits have been removed.

## 6. Testing and build verification

- Tests live primarily under `src/lib/__tests__/` and `src/extensions/__tests__/`.
- `npm test` / `pnpm test` runs Vitest.
- Current verification status: 37 tests passing across 3 test files.
- TypeScript validation passes with `npx tsc -p tsconfig.app.json --noEmit`.
- Production build passes with `npm run build` / `pnpm build`.

The parser tests use `MarkdownManager` directly, avoiding a browser-DOM dependency while still exercising the production TipTap Markdown tokenizer registry.

## 7. Repository organization

- `docs/archive/` contains historical PRDs, comparisons, and debugging notes.
- `scripts/legacy/` contains retained ad-hoc diagnostic scripts.
- `CODE_AUDIT.md` contains the code-audit findings and remediation history.
- `pnpm-lock.yaml` is the canonical dependency lockfile; the obsolete npm lockfile has been removed.
- `Dockerfile` remains at the repository root because its current deployment relevance has not been established.

## 8. Known follow-up work

1. Remove or formally isolate the legacy `markdownToTipTap()` implementation once compatibility tests no longer require it.
2. Continue replacing residual `any` types inside TipTap integration and node-view boundaries.
3. Consider splitting the large presentation components, especially `SettingsModal.tsx` and `OnboardingModal.tsx`.
4. Consider lazy-loading performance diagnostics and the graph bundle for smaller initial loads.
5. Review `std::env::set_var` before any Rust 2024 edition migration.
