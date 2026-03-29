# Folio — Codebase Overview (Current)

> Version: 0.3.0  
> Stack: Tauri v2 + React 18 + TypeScript + TipTap 3 + Tailwind CSS 3 + Vite  
> Last updated: March 29, 2026

---

## 1) High-Level Architecture

```text
App
└─ Providers
   ├─ SettingsProvider
   ├─ ModalProvider
   └─ WorkspaceProvider
      └─ Bootloader + VaultContext wiring
         └─ MainLayout
            ├─ Sidebar
            ├─ TabBar (main + split strips in same top row)
            ├─ Editor pane A (main)
            ├─ Editor pane B (split, optional)
            ├─ Split drag separator (shared ratio)
            └─ StatusBar

ModalRoot (global overlays)
├─ QuickSwitcher (commands + notes)
├─ ContextMenu
├─ RenameModal / MoveModal / Folder flow
├─ SettingsModal
└─ Toast
```

Core idea:

- The app is a **single editing shell** with optional split-pane mode.
- Both panes are first-class tabs with independent active state.
- Markdown is parsed by TipTap markdown extensions on load, then serialized by `tipTapToMarkdown` on save.

---

## 2) Runtime Layering

### 2.1 UI and State

- `src/App.tsx`
  - Builds provider hierarchy.
  - Runs boot flow (`useAppBootloader`).
  - Owns pane focus state (`main` vs `split`).
  - Creates two editor state channels (one per pane) through `useEditorState`.

- `src/components/MainLayout.tsx`
  - Shell layout, focus mode visibility behavior, sidebar collapse behavior.
  - Split-pane rendering and drag-resize ratio state.
  - Passes split ratio into top `TabBar` so tab geometry matches content geometry.

- `src/components/TabBar.tsx`
  - Renders main/split tabs in the same strip.
  - Applies pane-focused active styling.
  - Houses theme toggle and native window control integration.

### 2.2 Domain Hooks

- `src/hooks/useTabs.ts`
  - Canonical tab model:
    - `mainTabIds`, `splitTabIds`, `activeTabId`, `splitTabId`, shared `tabById`.
  - Pane-aware open/close/select APIs:
    - `openTab`, `openTabInSplit`, `closeTabInPane`, `setActiveTabId`, `setSplitTabId`, `closeSplitTab`.
  - Contains lifecycle guards to avoid tab-content loss scenarios when moving between main/split contexts.

- `src/hooks/useFileSystem.ts`
  - Vault state authority (`rootPath`, tree, notes, backlink index).
  - Uses adapter API from `src/lib/fs` for read/write/scan/move/rename/delete.
  - Maintains incremental index updates and editor scroll/cursor state snapshots.

- `src/hooks/useFileOperations.ts`
  - UI-facing operations (new note, rename, move, delete, export PDF, open in split).
  - Handles wikilink click routing and same-note anchor behavior.

- `src/hooks/useEditorState.ts`
  - Content hydration and autosave loop (debounced + tab-switch flush).
  - Corruption detection integration.
  - Editor lifecycle guard rails around hydration, remounting, and sync.

### 2.3 Contexts

- `src/contexts/VaultContext.tsx`
  - Exposes vault notes/backlinks and wikilink-open handler to editor widgets.

- `src/contexts/ModalContext.tsx`
  - Single state machine for global modal orchestration.

- `src/contexts/WorkspaceContext.tsx`
  - Multi-vault workspace list and active-workspace routing.

---

## 3) Markdown + Editor Pipeline

## 3.1 Extension Registry

`src/lib/editor/extensions.ts` is the single most important markdown/editor registry.

Current stack includes:

- `StarterKit` (H1-H6 enabled)
- `Markdown` (`@tiptap/markdown`) with `breaks: true`
- `Typography`, `Placeholder`
- `CodeBlockLowlight`
- `Link`
- Custom nodes/extensions:
  - `Wikilink`
  - `Callout`
  - `Frontmatter`
  - `Tag`
  - `MathBlock`
  - `InlineMath`
  - `Embed`
- UX/editor behavior:
  - `TypewriterMode`
  - `SlashCommand` (includes `/Code Block` insertion command)
  - `SmoothCaret`
  - `MarkdownPaste`
  - `CodeBlockCopy` (hover copy affordance for fenced code blocks)
- Table suite:
  - `Table`, `TableRow`, `TableHeader`, `TableCell`
- `Highlight`
- `TauriImage` wrapper (maps `attachments/...` to `convertFileSrc(...)` in Tauri)

## 3.2 Load Path

- `useEditorState` reads markdown from file.
- It currently strips leading YAML frontmatter via `stripFrontMatter(...)`.
- Editor content is then set using `setContent(markdown, { contentType: 'markdown' })` so TipTap parser + custom tokenizers run.

## 3.3 Save Path

- `useEditorState` autosave and tab-switch flush call `tipTapToMarkdown` (`src/lib/markdown.ts`).
- Serializer handles:
  - headings/lists/tasks/quotes/code/hr/hardbreak
  - callouts
  - tables
  - highlights
  - math inline/block
  - tags
  - wikilinks and embeds
  - frontmatter node
  - Tauri attachment URL normalization back to portable markdown paths

---

## 4) Split Pane and Tab System (Current)

### 4.1 Behavior

- Two panes: `main` and optional `split`.
- Each pane has its own active tab pointer.
- Command palette (`Ctrl/Cmd+K`) and close-tab (`Ctrl/Cmd+W`) actions are routed to the **focused pane**.
- `Alt/Ctrl/Cmd + Enter` in quick switcher opens in split.
- Context menu includes “Open in Split”.

### 4.2 UI Details

- Both pane tab groups are rendered in one top strip (`TabBar`).
- Split ratio is shared between:
  - top tab strip pane widths
  - editor pane widths
- Divider is draggable and clamped to a safe range (prevents pane collapse).

Key files:

- `src/components/MainLayout.tsx`
- `src/components/TabBar.tsx`
- `src/hooks/useTabs.ts`
- `src/components/ModalRoot.tsx`
- `src/components/QuickSwitcher.tsx`

---

## 5) Markdown-Focused Custom Components

- `src/components/CalloutNodeView.tsx`
  - Icon-triggered type menu (icon-only grid)
  - fold toggle in floating menu
  - empty-callout inline hint

- `src/components/TableToolbar.tsx`
  - Bubble controls for row/column insert/delete, merge/split, header row toggle

- Codeblock copy UX (Obsidian-style hover affordance)
  - Implemented via `CodeBlockCopy` extension using a safe overlay button that copies full block text.

- `src/components/FrontmatterNodeView.tsx`
  - Collapsible properties block UI for frontmatter nodes

- `src/components/WikilinkNodeView.tsx`
  - Rich inline wikilink rendering and interaction

- `src/components/MathBlockNodeView.tsx` / `InlineMathNodeView.tsx`
  - KaTeX-backed rendering/editing UX

---

## 6) Key User Flows

### 6.1 Note Open / Edit / Save

1. User opens note (sidebar, quick switcher, wikilink).
2. `useEditorState` hydrates markdown into TipTap.
3. User edits content.
4. Debounced autosave serializes TipTap JSON via `tipTapToMarkdown` and writes file.
5. Switching tabs flushes immediately to avoid lost writes.

### 6.2 Open in Split

1. Trigger via context menu or command palette.
2. `useFileOperations.handleOpenInSplit` calls `tabs.openTabInSplit(...)`.
3. Split pane mounts if needed.
4. Focused pane determines where quick-switch actions target.

### 6.3 Rename / Move / Delete

1. Action originates in sidebar/context menu/modals.
2. `useFileOperations` invokes filesystem adapter operations.
3. `useTabs` remaps IDs/paths where required.
4. Vault tree + notes + backlinks are rebuilt or incrementally updated.

---

## 7) Testing and Quality Signals

Current markdown-focused tests:

- `src/lib/__tests__/markdown.test.ts`
  - Serializer coverage for highlight, tag, callout, frontmatter, embed, math, table.

- `src/lib/__tests__/parse.test.ts`
  - Parser coverage for callout/embed/math and frontmatter false-positive regression around hr/table/hr patterns.

Note:

- Test suite is targeted rather than exhaustive; many UX-level interactions are still verified manually.

---

## 8) Important Caveats / Technical Debt

1. Frontmatter mismatch in runtime path:
- Extension + serializer exist, but load pipeline currently strips leading YAML before editor hydration.

2. Embed semantics:
- Syntax nodes exist; full transclusion/media rendering parity with Obsidian is not complete.

3. Parser duality complexity:
- There is TipTap markdown parsing on load and custom serialization on save, so parity regressions can appear in edge formats.

4. Legacy artifact:
- `src/components/PaneTabStrip.tsx` remains in tree but is no longer used after unified top-strip implementation.

5. Duplicate extension warning:
- Runtime currently logs duplicate `link` extension names; worth cleanup to avoid extension ordering edge-cases.

---

## 9) Quick Reference Map

### App shell and layout
- `src/App.tsx`
- `src/components/MainLayout.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TabBar.tsx`
- `src/components/StatusBar.tsx`

### Modal and command surfaces
- `src/components/ModalRoot.tsx`
- `src/components/QuickSwitcher.tsx`
- `src/components/ContextMenu.tsx`
- `src/components/RenameModal.tsx`
- `src/components/MoveModal.tsx`

### Editing core
- `src/components/Editor.tsx`
- `src/lib/editor/extensions.ts`
- `src/lib/markdown.ts`
- `src/hooks/useEditorState.ts`

### Filesystem and data
- `src/hooks/useFileSystem.ts`
- `src/hooks/useFileOperations.ts`
- `src/hooks/useTabs.ts`
- `src/lib/fs/*`

### Markdown extension modules
- `src/extensions/Wikilink.ts`
- `src/extensions/Callout.ts`
- `src/extensions/Frontmatter.ts`
- `src/extensions/Tag.ts`
- `src/extensions/Embed.ts`
- `src/extensions/MathBlock.ts`
- `src/extensions/InlineMath.ts`
- `src/extensions/MarkdownPaste.ts`
- `src/extensions/CodeBlockCopy.ts`

---

## 10) Contributor Notes

If you are changing markdown behavior, update these together:

1. Extension tokenizer/parsing (`src/extensions/*`)  
2. Save serializer (`src/lib/markdown.ts`)  
3. Parse + serializer tests (`src/lib/__tests__/parse.test.ts`, `src/lib/__tests__/markdown.test.ts`)  
4. User-facing docs (`markdown_comparison.md`, this file)

Keeping those in sync is the best defense against silent markdown drift.
