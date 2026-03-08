# Folio — Codebase Overview

> **Version:** 0.2.0 · **Stack:** Tauri v2 + React 18 + TypeScript + TipTap + Tailwind CSS 3 + Vite  
> **Last updated:** March 8, 2026

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
│  │                │  │  │   ├ SmoothCaret (GPU-Composited)        │  │ │
│  │                │  │  │   └ EditorContent                       │  │ │
│  │                │  │  └─────────────────────────────────────────┘  │ │
│  │                │  │  StatusBar                                    │ │
│  └────────────────┘  │  └ FloatingBacklinks                          │ │
│                      └───────────────────────────────────────────────┘ │
│  VaultContext (notes, backlinkIndex, onWikilinkClick, fileSystem)      │
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
  │  │ native 'open()',     │                    │ Access API       │  │
  │  │ 'convertFileSrc'     │                    │ (Handles Cache)  │  │
  │  └──────────┬───────────┘                    └────────┬─────────┘  │
  └─────────────┼─────────────────────────────────────────┼────────────┘
                │                                         │
        lib/config.ts                               lib/markdown.ts
(FolioConfig v1. localStorage fallback)     (MD ↔ TipTap JSON parser,
                                             URL resolution & serialization)
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
| `Cargo.toml` | Rust dependencies. Registers plugins: `fs`, `dialog`, `os`, `path` alongside `tauri` v2. |
| `tauri.conf.json` | Core Tauri build config (identifier, window sizes). Configures `assetProtocol` in `app.security` to permit WebViews to request local disk images via the `http://asset.localhost/` scheme. |
| `capabilities/default.json` | Security scopes for file system access (`fs:allow-read-file`, `fs:allow-write-file`, `fs:allow-read-dir`, `fs:allow-mkdir`, `core:default`, `dialog:allow-open`, and robust recursive path `$HOME/**` scopes). |

### Styles (`src/`)

| File | Purpose |
|------|---------|
| `index.css` | Global styles: Tailwind directives, base theme (light + dark), prose typography (`.prose-folio`), sidebar transitions, focus mode logic, and overscroll prevention. |

### Components (`src/components/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root application layout. Wires together sidebar, tabs, editor. Manages file loading, auto-save (1s debounce), and the `loadConfig` boot sequence. |
| `ContextMenu.tsx` | Reusable right-click menu with boundary detection. |
| `Editor.tsx` | Core TipTap editor wrapper. Configures all extensions, intercepts drop/paste events, and mounts a **debounced (1000ms) base64 image scanner loop** to seamlessly write ephemeral pasted images to disk natively via the filesystem adapter without choking the CPU main thread. |
| `ErrorBoundary.tsx` | Standard React error boundary for unhandled promise rejection recovery. |
| `FileTree.tsx` | Recursive tree component for sidebar folder/file routing. Highlights the active file, handles nested state toggles, and actively excludes the internal `attachments` directory from visibility. |
| `FloatingBacklinks.tsx` | Popover triggered via the status bar showing referring notes. |
| `FloatingToolbar.tsx` | TipTap `BubbleMenu` wrapper. Shows text formatting buttons. |
| `GraphView.tsx` | Interactive canvas visualization (`react-force-graph-2d`). Styled with zoom-aware text and link highlighting. |
| `NewNoteInput.tsx` | Inline input component for creating new notes directly inside the sidebar tree. |
| `NoteTitle.tsx` | Editable inline title at the top of the editor. Modifying this explicitly triggers file moves via `useFileSystem`. |
| `QuickSwitcher.tsx` | Command palette modal (`Cmd+K`) using Fuse.js for fuzzy-searching paths. |
| `Sidebar.tsx` | Navigational left pane. Features a collapsible transition mapped for Focus Mode support. |
| `StatusBar.tsx` | Bottom bar housing word count, reading time stats, and graph triggers. |
| `TabBar.tsx` | Draggable multiple file tabs interface powered by `@dnd-kit/core`. |
| `WikilinkDropdown.tsx` | Autocomplete UI selecting notes when typing `[[`. Mounted via Tippy.js. |

### Contexts & Hooks (`src/hooks/`, `src/contexts/`)

| File | Purpose |
|------|---------|
| `useFileSystem.ts` | **Hybrid** OS/Browser API integration layer. Dispatches native operations using `@tauri-apps/plugin-fs` bindings (create, read/write binaries, recursive mkdir for attachments) on Desktop, or maps to standard File System Access handles (Chrome). Maintains the global `notes` set, `backlinkIndex`, and file lifecycle. |
| `useTabs.ts` | State machine governing multi-tab concurrency (pointers, close, rename, dragging). |
| `VaultContext.tsx` | Injects the active `vault`, `fileSystem` adapter, and backlink graphs directly into components via context to eliminate prop drilling through layout elements. |
| `useTheme.tsx` | Context holding light/dark color scheme state synced iteratively to DOM attributes and `FolioConfig`. |

### Core Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `config.ts` | Manages OS AppData configurations via `FolioConfig v1`, maintaining `lastOpenedVault` history and UI bounds securely. |
| `markdown.ts` | Bidirectional parser mapping `.md` strings ↔ TipTap JSON nodes. Features complex internal interception sequences for `tauri://localhost` asset URL extraction on save, stripping absolute asset URIs gracefully back into portable relative `attachments/name.png` paths inside the Markdown text format. |
| `editor/extensions.ts` | Defines the TipTap plugin registry. Configures the base markdown nodes, installs the customized `link` extensions, and fundamentally alters the `image` extension to dynamically map portable relative paths (`attachments/xyz.png`) into absolute disk paths using Tauri's `convertFileSrc` native API at instantiation time for zero-config rendering. |

### TipTap Extensions (`src/extensions/`)

| File | Purpose |
|------|---------|
| `MarkdownPaste.ts` | Plugin intercepting plain-text and HTML OS paste payloads and tunneling them directly into `markdownToTipTap` JSON node transformations instead of raw text strings. |
| `SmoothCaret.ts` | Custom physics engine mapping ProseMirror states to a highly performant GUI caret. Eliminates browser DOM layout thrashing by executing all animations via 180ms CSS `transform: translate` matrices on the GPU compositor thread. Accommodates external layout collapse routines via a precise `ResizeObserver`. |
| `TypewriterMode.ts` | Extension locking the vertical Y-offset of the active text block to the center of the viewport, effectively creating distraction-free continuous writing environments. Safely disengages during mouse interaction. |
| `SlashCommand.ts` | TipTap plugin tracking `/` characters to trigger quick-action block insertion popovers. |
| `Wikilink.ts` | Node extension establishing AST bounds for `[[Text]]` entities, and linking the tippy.js suggestions controller to `WikilinkDropdown`. |

---

## Data Pipelines & Execution Flows

### 1. The Boot Sequence (Auto-Loading)

```text
App.tsx mounts
  → loadConfig() reads active OS Application Support config.json (via Tauri fs)
  → if config.vault.lastOpenedVault string survives validation:
      → useFileSystem.loadVault(path) validates structural directory
      → recursive scan loops the folder, ignoring system / attachments files
      → fileSystem populates global contexts, mounting the UI shell silently
```

### 2. Auto-Save Pipeline
```text
User types in Editor Content
  → TipTap onUpdate hooks fire synchronously
  → updateWordCount(editor) increments UI
  → useEditorState.ts triggers delayed debounced save loop (1000ms delay)
    → editor.getJSON() extracts active TipTap AST
    → tipTapToMarkdown(json) executes sequence pipeline:
       └ Regex/parsers extract native Tauri asset:// URIs and re-normalize them to relative markdown URLs.
    → useFileSystem.writeFile(path, processedMarkdown) executes via OS File Handle.
```

### 3. Image Persistence & Attachment Pipeline

```text
User pastes image payload (Clipboard API / Drag Drop)
  → Core browser creates an ephemeral object representation (data: URI or blob: URI)
  → Editor.tsx debounced active scanner (running strictly on a 1000ms idle-typist delay) discovers the ephemeral 'src' inside the state descendents.
    → fetch(src).blob() extracts OS binary ArrayBuffer.
    → fileSystem natively validates/creates root `/attachments` folder.
    → OS writes binary buffer directly to `{vault}/attachments/attachment-{timestamp}.png`.
    → TipTap node receives a dispatched transaction overwriting the abstract blob URI with a `convertFileSrc()` asset scheme targeting the local hard drive.
    → WebView native assetProtocol renders the image instantly.
  → Markdown save pipeline later collapses this absolute URL for pure portability.
```

### 4. GPU-Accelerated Smooth Caret

```text
User initiates continuous keystrokes
  → ProseMirror Native Selection caret is CSS obscured.
  → SmoothCaret.ts onKeyDown capture-phase triggers isTyping variables natively bypassing propagation blocks.
  → ProseMirror coordsAtPos calculates exact abstract viewport (X, Y) layout boundaries.
  → SmoothCaret injects `transform: translate(x, y)` inline styles to a hidden absolute container.
  → CSS GPU hardware compositor thread intercepts the transformation without triggering native Browser Recalculate Styles or Layout phases, rendering physics in parallel to heavy JS AST routines.
```

### 5. Self-Healing Backlink Network

```text
User executes a Rename Command on Title block / Sidebar
  → useFileSystem intercepts the rename.
  → Iterates through every file string in the global BacklinkIndex map.
  → Programmatically runs regex text replacement modifying [[OldName]] → [[NewName]] across target documents.
  → Commits native save sequences across the changed pool.
  → Retriggers React Contexts to automatically redraw TabBar/Sidebar strings transparently to the user.
```

---

## PRD Phase Status

| PRD Phase | Scope | Status | Notes |
|---|---|---|---|
| **Phase 1** — Core Editor | TipTap editor, live markdown preview, typography | ✅ **Complete** | WYSIWYG editing, complex unified markdown parsing (`markdown.ts`) |
| **Phase 2** — File System | Native File System Access, auto-loading, robust configs | ✅ **Complete** | **Upgraded to Tauri v2**. Config persistent auto-loads (`FolioConfig`), fully scoped capabilities profiles config. |
| **Phase 3** — Wikilinks | `[[Note Name]]`, autocomplete, self-healing links | ✅ **Complete** | React NodeView wikilinks, dynamic backlink index. Renames modify target files automatically. |
| **Phase 4** — Context Menus | Right-click file management (Delete, Rename, New) in tree | ✅ **Complete** | Added inline `NewNoteInput.tsx` support inside directories. |
| **Phase 5** — Graph View | Force-directed graph with React Force Graph | ✅ **Complete** | Obsidian-style interactive map with hover highlights and zoom bounds. |
| **Phase 6** — Writing Modes | Focus mode, typewriter mode, quick switcher (`Cmd+K`) | ✅ **Complete** | Layouts supported by custom GPU caret transitions. Fuzzy search command palette routing installed. |
| **Phase 7** — Image Persistence | Drag/Drop local attachments and cross-OS markdown | ✅ **Complete** | `convertFileSrc` pipeline installed natively with automatic `.attachments` isolation and routing. |

---

## Running the App

```bash
# General Node Dev
npm install
npm run dev     # Starts Vite local server (Web Fallback Hybrid mode, heavily hobbled vs Desktop)

# OS Native (Tauri Desktop App)
npx tauri dev   # Starts Rust backend and attaches Vite frontend natively (Full Local FS mode)
```
