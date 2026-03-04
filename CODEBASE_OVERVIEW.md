# Folio — Codebase Overview

> **Version:** 0.2.0 · **Stack:** Tauri v2 + React 18 + TypeScript + TipTap + Tailwind CSS 3 + Vite  
> **Last updated:** February 27, 2026

---

## Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              App.tsx                                   │
│  ┌────────────────┐  ┌───────────────────────────────────────────────┐ │
│  │ Sidebar        │  │                   TabBar                      │ │
│  │  ├ FileTree    │  ├───────────────────────────────────────────────┤ │
│  │  └ actions     │  │              Main Editor Area                 │ │
│  │                │  │  ┌─────────────────────────────────────────┐  │ │
│  │ ContextMenu    │  │  │  NoteTitle (editable)                   │  │ │
│  │ RenameModal    │  │  ├─────────────────────────────────────────┤  │ │
│  │ QuickSwitcher  │  │  │  Editor (TipTap)                        │  │ │
│  │ NewNoteInput   │  │  │   ├ FloatingToolbar                     │  │ │
│  │                │  │  │   ├ WikilinkExtension                   │  │ │
│  │                │  │  │   ├ TypewriterMode                      │  │ │
│  │                │  │  │   └ EditorContent                       │  │ │
│  │                │  │  └─────────────────────────────────────────┘  │ │
│  └────────────────┘  │  StatusBar                                    │ │
│                      │  └ FloatingBacklinks                          │ │
│                      └───────────────────────────────────────────────┘ │
│  VaultContext (notes, backlinkIndex, onWikilinkClick)                  │
│  ThemeProvider, ErrorBoundary                                          │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │
  ┌───────────────────────────────────┴────────────────────────────────┐
  │                           useFileSystem                            │
  │     (Hybrid Abstraction layer routing to correct Environment)      │
  │  ┌──────────────────────┐                    ┌──────────────────┐  │
  │  │ Tauri Environment    │                    │ Web Environment  │  │
  │  │ (Desktop)            │                    │ (Browser PWA)    │  │
  │  │ native 'readDir()',  │                    │ File System      │  │
  │  │ native 'open()'      │                    │ Access API       │  │
  │  │ (Direct FS Access)   │                    │ (Handles Cache)  │  │
  │  └──────────┬───────────┘                    └────────┬─────────┘  │
  └─────────────┼─────────────────────────────────────────┼────────────┘
                │                                         │
        lib/config.ts                               lib/markdown.ts
(FolioConfig v1. localStorage fallback)     (MD ↔ TipTap JSON parser)
```

---

## File Map

### Entry & App Config (`/`)

| File | Purpose |
|------|---------|
| `index.html` | Single-page shell, loads Google Fonts (Inter, Libre Baskerville, JetBrains Mono). |
| `src/main.tsx` | React DOM entry point, renders `<App />`. |
| `vite.config.ts` | Vite dev/build configuration. |
| `tailwind.config.js` | Tailwind theme: colours, fonts, type scale, transitions, content width. |
| `postcss.config.js` | PostCSS pipeline (Tailwind + Autoprefixer). |
| `package.json` | Dependencies, scripts (`dev`, `build`, `tauri dev`). |

### Native Config (`src-tauri/`)

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust dependencies. Registers `plugin-fs` and `plugin-dialog` alongside `tauri` v2. |
| `tauri.conf.json` | Core Tauri build config (identifier, window sizes, icons). Points to local Vite ports. |
| `capabilities/default.json` | security scopes for file system access (`fs:allow-read`, `fs:allow-write`, `$APPCONFIG/**`). |

### Styles

| File | Purpose |
|------|---------|
| `src/index.css` | Global styles: Tailwind directives, base theme (light + dark), prose typography (`.prose-folio`), sidebar styles, overscroll/elastic scroll prevention. |

### Components (`src/components/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `App.tsx` | Root application layout. Wires together sidebar, tabs, editor, title, and status bar. Manages file loading, auto-save (1s debounce), and application boot sequence configurations (`loadConfig`). | `App` |
| `ContextMenu.tsx` | Reusable right-click context menu with boundary detection and scroll lock. Used for file operations in the sidebar. | `ContextMenu` |
| `Editor.tsx` | TipTap editor wrapper. Configures StarterKit, Wikilinks, and other extensions. Uses callback refs to avoid re-render cascades. | `Editor` |
| `ErrorBoundary.tsx` | React error boundary. Catches render crashes and shows a recovery UI. | `ErrorBoundary` |
| `FileTree.tsx` | Recursive tree component. Renders folders and files. Handles `onContextMenu` for file right-clicks. Highlights the active file. | `FileTree` |
| `FloatingBacklinks.tsx` | Popover triggered from the status bar showing all notes that link to the current active note. | `FloatingBacklinks` |
| `FloatingToolbar.tsx` | TipTap `BubbleMenu` wrapper. Shows text formatting buttons on text selection. | `FloatingToolbar` |
| `GraphView.tsx` | Force-directed interactive canvas visualization of the vault (`react-force-graph-2d`). Styled like Obsidian with hover states and zoom-aware labels. | `GraphView` |
| `NewNoteInput.tsx` | Inline input component for creating new notes directly inside the sidebar tree interface. | `NewNoteInput` |
| `NoteTitle.tsx` | Editable inline title at the top of the editor area. Renames the file on disk on blur/Enter. | `NoteTitle` |
| `QuickSwitcher.tsx` | Command palette modal (`Cmd+K`) using Fuse.js for fuzzy-searching and rapidly jumping between notes. | `QuickSwitcher` |
| `RenameModal.tsx` | Centered modal for renaming files, triggered from the context menu. Pre-filled with the current file name. | `RenameModal` |
| `Sidebar.tsx` | Left sidebar: vault name header, new-note button, file tree. Collapsible with smooth animation. | `Sidebar` |
| `StatusBar.tsx` | Bottom bar showing word count, reading time, and the backlinks popover toggle. | `StatusBar` |
| `TabBar.tsx` | Draggable tabs interface for managing multiple open files concurrently. Powered by `@dnd-kit/core`. | `TabBar` |
| `WikilinkDropdown.tsx` | Autocomplete UI for selecting notes when typing `[[`. Uses Tippy.js to position over the cursor. | `WikilinkDropdown` |
| `WikilinkNodeView.tsx` | Custom React component for rendering `[[Wikilinks]]` in the editor. Styles missing links as dashed stubs. | `WikilinkNodeView` |
| `WikilinkSuggestion.ts` | Provides the Tippy.js plugin rendering context for TipTap's `suggestion` extension, binding `WikilinkDropdown`. | `render` config |

### Hooks (`src/hooks/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `useFileSystem.ts` | **Hybrid** File System API integration. Uses dynamic `import()` to detect and load native Tauri APIs (Desktop) or falls back to standard File System Access handles (Chrome/Web). Reads/writes files, handles rename/delete in subdirectories, loads paths deep-check, and builds a global `backlinkIndex` and `notes` Set. | `useFileSystem`, `isTauri` |
| `useTabs.ts` | State management for the multi-tab interface (open, close, rename, reorder, active pointer). | `useTabs` |
| `useTheme.tsx` | Dark/light theme provider using React context. Persists to `localStorage`. | `ThemeProvider`, `useTheme` |
| `useWordCount.ts` | Extracts word count and reading time. | `useWordCount` |

### Contexts (`src/contexts/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `VaultContext.tsx` | Shared state for wikilink-related data, providing the global `notes` set, `backlinkIndex`, and `onWikilinkClick` without prop drilling. | `VaultContext` |

### Libraries (`src/lib/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `config.ts` | Loads and manages `FolioConfig v1` JSON payloads. Stores UI persistence (Theme/Defaults) and Vault History (recent/lastOpened). Targets OS AppData securely via Tauri or falls back to Web `localStorage`. | `loadConfig`, `saveConfig`, `FolioConfig` |
| `markdown.ts` | Bidirectional markdown ↔ TipTap JSON converter. **Parser** (`markdownToTipTap`): Full ast manipulation supporting complex nested blocks. **Serializer** (`tipTapToMarkdown`): converts TipTap JSON back to clean `.md` text for disk saving. | `markdownToTipTap`, `tipTapToMarkdown` |

### Extensions (`src/extensions/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `MarkdownPaste.ts` | Custom TipTap ProseMirror plugin. Intercepts plain-text paste events, converts to TipTap JSON via `markdownToTipTap`, and inserts as formatted content. | `MarkdownPaste` |
| `TypewriterMode.ts` | Custom TipTap Extension that keeps the active cursor line vertically centered. Features precise intent-detection, ignoring clicks/drags. | `TypewriterMode` |
| `Wikilink.ts` | TipTap Node extension for handling `[[Note Name]]` syntax. Associates `WikilinkNodeView` and configures autocomplete parameters. | `Wikilink` |

---

## Data Flow

### Boot Sequence (Auto-Loading)

```text
App.tsx mounts
  → loadConfig() reads OS ~/.config/folio.json
  → if config.vault.lastOpenedVault exists:
      → useFileSystem.loadVault(path) deep-validates directory
      → scanDirectory builds internal graph
      → vault successfully restored and mounted without file pickers
```

### Opening & Reading Notes

```text
User clicks file in FileTree
  → Sidebar.onFileSelect(path)
  → App.loadFile(path)
    → useFileSystem.readFile(path)        // reads .md text natively via Tauri (or cache)
    → markdownToTipTap(text)              // parses markdown ast to TipTap JSON
    → editor.commands.setContent(doc)     // loads into TipTap
    → setActiveFile(path)                 // updates sidebar highlight + tab state
    → restore scroll position             // from per-file cache
```

### Auto-Save Pipeline

```text
User types in editor
  → TipTap onUpdate fires
  → handleEditorUpdate(editor)
    → updateWordCount(editor)             // updates status bar
    → triggerAutoSave()                   // starts 1s debounce timer
      → (after 1 second)
      → editor.getJSON()                  // gets TipTap JSON
      → tipTapToMarkdown(json)            // serializes TipTap AST cleanly to markdown text
      → useFileSystem.writeFile(path, md) // async writes natively to OS disk
```

### Renaming / Self-Healing Backlinks

```text
User changes NoteTitle and presses Enter
  → NoteTitle.commitRename()
    → App.handleRename(newName)
      → useFileSystem.renameFile(oldPath, newName)
        → natively moves oldPath to newPath via Tauri
        → triggers full vault file map resolution
        → automatically rewrites [[OldName]] → [[NewName]] dynamically in ALL other notes on disk
        → refreshes local reactive state trees
```

---

## PRD Phase Status

| PRD Phase | Scope | Status | Notes |
|---|---|---|---|
| **Phase 1** — Core Editor | TipTap editor, live markdown preview, typography | ✅ **Complete** | WYSIWYG editing, complex unified markdown parsing (`markdown.ts`) |
| **Phase 2** — File System | Native File System Access, auto-loading, robust configs | ✅ **Complete** | **Upgraded to Tauri v2**. Config persistent auto-loads (`FolioConfig`), hybrid web fallback. |
| **Phase 3** — Wikilinks | `[[Note Name]]`, autocomplete, self-healing links | ✅ **Complete** | React NodeView wikilinks, dynamic backlink index. Renames modify target files automatically. |
| **Phase 4** — Context Menus | Right-click file management (Delete, Rename, New) in tree | ✅ **Complete** | Added inline `NewNoteInput.tsx` support inside directories. |
| **Phase 5** — Graph View | Force-directed graph with React Force Graph | ✅ **Complete** | Obsidian-style interactive map with hover highlights and dynamic text scaling. |
| **Phase 6** — Writing Modes | Focus mode, typewriter mode, quick switcher (`Cmd+K`) | ✅ **Complete** | Progressive blur typewriter mode bounds. Fuzzy search command palette. |
| **Phase 7** — Sync & Polish | Dark/light toggle, animations, Mobile/Database Sync | 🟡 **Partial** | Full UI animations and global OverScroll prevention deployed. Sync pending. |

---

## Running the App

```bash
# General Node Dev
npm install
npm run dev     # Starts Vite local server (Web Fallback Hybrid mode)

# OS Native (Tauri Desktop App)
npx tauri dev   # Starts Rust backend and attaches Vite frontend to desktop window
```
