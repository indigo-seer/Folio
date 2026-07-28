# Folium — Codebase Overview (Current)

> Version: 0.4.5  
> Stack: Tauri v2 + React 18 + TypeScript + TipTap 3 + Tailwind CSS 3 + Vite  
> Key Libraries: framer-motion, react-force-graph-2d, jspdf, html2canvas, fuse.js, lowlight, katex
> Last updated: April 10, 2026

---

## 1) High-Level Architecture

```text
App
└─ Providers
   ├─ SettingsProvider
   ├─ ModalProvider
   └─ WorkspaceProvider
      └─ Bootloader + VaultContext wiring
         └─ VaultProviderWrapped
            └─ MainLayout
               ├─ Sidebar (File Tree)
               ├─ TabBar (main + split strips in same top row)
               ├─ Main Pane Context
               │  ├─ Editor Component (with corruption banners, note titles)
               │  └─ folium-graph (Graph View)
               ├─ Split Pane Context (optional)
               │  └─ Editor Component
               ├─ Split drag separator (shared ratio)
               └─ StatusBar
```

### Core Idea:
- **Folium is an integrated editing shell** that brings powerful Obsidian Flavored Markdown (OFM) to life inside a responsive split-pane UI.
- The app has been renamed to **Folium** from Folio, reflecting its evolution.
- Extensive features like native Graph Views, PDF Exports, robust OFM support (Wikilinks, Math, Embeds), and smooth animations construct an integrated desktop experience.

---

## 2) Runtime Layering

### 2.1 UI and State

- `src/App.tsx`
  - Defines Provider hierarchy.
  - Controls initial Bootloader state (`useAppBootloader`) and Onboarding.
  - Manages editor and split states using `BootloaderWrappedContent` and `VaultProviderWrapped`.
  - Audits typings using `performanceAudit.ts`.
- `src/components/MainLayout.tsx`
  - Container layout encompassing the Sidebar, Focus Mode features, and top TabBar.
  - Handles the split-pane logic natively and responsive active Tab mappings.
- `src/components/GraphView.tsx`
  - Uses `react-force-graph-2d` to visualize vault note nodes and relationships extracted via backlinks and wikilinks. Handled as a tab in MainLayout.

### 2.2 Domain Hooks

- `src/hooks/useTabs.ts`
  - The canonical Tab state machine: `mainTabIds`, `splitTabIds`, `activeTabId`, `splitTabId`, and `tabById`.
  - Operations for layout logic: `openTab`, `openTabInSplit`, `setActiveTabId`, `setSplitTabId`, `closeTabInPane`.
- `src/hooks/useFileSystem.ts`
  - Controls vault authority: `rootPath`, vault files tree, indexed notes, and dynamic `backlinkIndex`.
- `src/hooks/useFileOperations.ts`
  - Provides UX actions: creating Notes, renaming, moving, deleting, creating Wikilink structures, routing, and **Exporting to PDF**.
- `src/hooks/useEditorState.ts`
  - Combines hydration, corruption prevention, cursor positioning logic, and the core saving debouncer hooked into markdown serialization.

### 2.3 Contexts

- `src/contexts/VaultContext.tsx`: Distributes access to `notes`, `backlinkIndex`, and handles file interactions inside the React tree.
- `src/contexts/ModalContext.tsx`: Single global machine for Modals (`QuickSwitcher`, `MoveModal`, etc.).
- `src/contexts/WorkspaceContext.tsx`: Deals with managing multiple distinct target folders that have `.folium` workspaces.

---

## 3) Markdown + Editor Pipeline

Folium's most crucial layer handles parsing Obsidian styling locally while editing.

### 3.1 Extension Registry (`src/lib/editor/extensions.ts`)
The TipTap environment is augmented extensively:
- **Content Blocks:** `Markdown`, `Typography`, `TaskList`, `Table` Suite (`TableRow`, `TableHeader`, `TableCell`).
- **Obsidian Syntax Nodes:** `Wikilink`, `Callout`, `Tag`, `Frontmatter`, `Embed`, `MathBlock`, `InlineMath`.
- **Media Customization:** `TauriImage` and `ObsidianImage` resolve local caching dynamically taking resources from `attachments/*` and fetching via caching system.
- **UX Behaviors:** `TypewriterMode`, `SmoothCaret`, `SlashCommand`, `MarkdownPaste`, `CodeBlockCopy`, and `Highlight`.

### 3.2 Parsing / Loading Path
- Reads markdown -> `stripFrontMatter` handles legacy edge-cases.
- `setContent(markdown)` processes node parsing. Caching functions (`imageCache.ts`) load images smoothly natively without performance penalties.

### 3.3 Autosave & Serializer Path
- Debounced functions track typed words (`performanceAudit.ts`).
- When triggered, `tipTapToMarkdown` (`src/lib/markdown.ts`) normalizes structures like equations, embedded media, metadata objects, and callouts back perfe check passes: npx tsc -p tsconfig.app.json --noEmit
Focused tests pass: 32/32
Full Vitest run: 32 passed, 5 failed because parse.test.ts creates a TipTap editor without a browser window/DOM test environment. This appears to be test setup rather than a detected application failure.
The Rust set_var finding is valid as a future-compatibility warning: the project is still Rust 2021, where it compiles, but Rust 2024 makes set_var unsafe and requires a safety review. Rust Edition Guide

 splitting remains inconsistent despite getBasename() existing.
Root-levectly to markdown.

---

## 4) Key Submodules & Utilities

### 4.1 PDF Export (`src/lib/pdfExport.ts`)
- Allows users to turn a single markdown document into a shareable A4-sized PDF.
- Renders an invisible DOM with the note content, awaits font/image stabilization (`waitForImages`), and leverages `html2canvas` generating imagery mapped into a `jsPDF` component handling chunking dimensions dynamically.

### 4.2 Image Caching & Processing
- Contains a complex media proxy (`vaultImageMigration.ts`, `imageIngestion.ts`, `imageCache.ts`).
- Images dropped/pasted are moved to an `attachments/` folder asynchronously and cached to improve initial load speed on large graph contexts. 

### 4.3 Corruption Protection
- Implemented `CorruptionBanner.tsx` and `corruptionDetector.ts` that warns users if structural breaks occur inside the markdown abstract syntax tree preventing save failures.

---

## 5) Tab and UI Ecosystem

- **Tab Manager**: The unified `TabBar.tsx` supports split strips gracefully, displaying names extracted accurately from `useTabs.ts` mappings.
- **Global Modals**: `QuickSwitcher.tsx` helps rapidly navigate tags, commands, and notes. Operations are focused dynamically checking `focusedPane` state from `App.tsx`.
- **Note Frontmatter & Callouts**: Visual interactive boxes managed by `FrontmatterNodeView.tsx` and `CalloutNodeView.tsx`.
- **Animations:** Utilizing `framer-motion` inside Modals and smooth UI elements, including smooth responsive typing cursors using `SmoothCaret`.

---

## 6) Testing and Quality Signals

- Test suites located in `src/lib/__tests__/`.
- Highly targeted tests including `parse.test.ts` and `markdown.test.ts` matching TipTap serializers to exact String formats to avoid markdown drift in features like tables, equations, and tasks.

---

## 7) Important Caveats / Technical Debt

1. **Vault Duality**: Parsing and serialization have separate pipelines (`extensions.ts` vs `markdown.ts`). Changes to block representations must always modify *both* pipelines concurrently.
2. **Graph View Size**: `react-force-graph-2d` loads in a single pass; scaling logic needs periodic observation for mega-vault geometries.
3. **Embed Semantics**: Standard Obsidian block ID embedding (`![[note#block]]`) is parsed, but deep, nested cyclic transclusion logic handles basic cases natively for stability.
4. **Graph Tab Hack**: `folium-graph` operates as an irregular tab identifier within standard Note layout flow triggering custom renders on switch.

---

## 8) Contributor Notes

When adding new Markdown behaviors:
1. Extend Tokenizer in (`src/extensions/*`).
2. Add Serializer formatting in (`src/lib/markdown.ts`).
3. Add respective test logic in (`src/lib/__tests__/`).
4. Update this overview logic file if adding massive structural shifts.
