# Folium — Code Audit Report

> Audited: April 11, 2026  
> Scope: Full frontend (React/TS), backend (Rust/Tauri), and project config

---

## Executive Summary

Folium is a well-structured Tauri + React + TipTap markdown editor with strong feature coverage. However, the codebase has accumulated technical debt across several dimensions. The most impactful issues are: **pervasive `any` types undermining TypeScript's value**, **a duplicated markdown pipeline**, **excessive prop-drilling**, and **dead code/duplicated constants**. Below is a priority-ordered breakdown.

---

## 🔴 Critical (Fix First)

### 1. Pervasive `any` Types — Type Safety Is Effectively Opt-Out

Nearly every major interface boundary uses `any` instead of proper types. This eliminates compile-time error detection — the primary reason to use TypeScript.

| File | Line(s) | What's `any` |
|------|---------|--------------|
| `App.tsx` | 67, 105 | `BootloaderWrappedContent` and `VaultProviderWrapped` accept **all props as `any`** |
| `App.tsx` | 249, 280 | `tabs.tabs.find((t: any) => ...)` — tab data is untyped at usage |
| `MainLayout.tsx` | 13–15 | `fileSystem: any`, `tabs: any`, `fileOperations: any` |
| `WorkspaceContext.tsx` | 28–29 | Provider accepts `fileSystem: any`, `tabs: any` |
| `useAppBootloader.ts` | 10–11 | `fileSystem: any`, `tabs: any` |
| `useFileOperations.ts` | 6 | `fileSystem: any` |
| `useEditorState.ts` | 15 | `tabs: any[]` |
| `VaultContext.tsx` | 6, 14 | `fileSystem: any` with `// Will be properly typed` TODO comment |
| `extensions.ts` | 122 | `Markdown.configure({...} as any)` |

**Impact:** Bugs that TypeScript would catch at compile time can only be found at runtime. Refactors are dangerous without type checking.

**Fix:** 
1. Export a `FileSystemAPI` return type from `useFileSystem` and a `TabsAPI` from `useTabs`.
2. Export a `FileOperationsAPI` from `useFileOperations`.
3. Replace every `any` prop with these named types.

---

### 2. Stale Closure Bug in `ModalContext.tsx`

```typescript
// Line 60 — closeContextMenu captures the CURRENT state, not the latest
closeContextMenu: () => updateState({ contextMenu: { ...state.contextMenu, isOpen: false } }),
```

`state.contextMenu` is captured from the render-time closure, not from the latest state. If any other modal operation fires between the context menu opening and closing, the X/Y/path/kind values will be stale.

**Fix:** Use a functional updater: `setState(prev => ({ ...prev, contextMenu: { ...prev.contextMenu, isOpen: false } }))`.

---

### 3. Dead Hook: `useTheme.tsx` Conflicts with `useSettings.tsx`

`useTheme.tsx` provides its own `ThemeProvider` with `localStorage`-based theme persistence that:
- Duplicates the dark/light class toggling already in `useSettings.tsx` (lines 55–80)
- Uses `localStorage` directly, conflicting with the config-based persistence in `useSettings`
- Is **never imported or used** anywhere in the app

**Fix:** Delete `src/hooks/useTheme.tsx` entirely.

---

## 🟠 High Priority (Architectural)

### 4. Duplicated Markdown Pipeline — Two Parsers, One Source of Truth

The codebase has **two independent markdown parsers**:

1. **`@tiptap/markdown`** — used at runtime via `setContent(markdown, { contentType: 'markdown' })` in `useEditorState.ts:169`
2. **`src/lib/markdown.ts`** — a custom 868-line hand-rolled parser (`markdownToTipTap`)

The custom parser (`markdownToTipTap`) appears to be **dead code** — it's exported but never called. All loading goes through TipTap's native markdown extension. However, the serializer (`tipTapToMarkdown`) is actively used for saving.

This creates a dangerous asymmetry: parsing and serialization follow completely different code paths, and bugs in one won't necessarily surface in the other.

**Fix:** 
- Confirm `markdownToTipTap` is truly unused and remove it (along with `parseBlocks`, `parseInline`, `isBlockStart`, `addTextNode` — ~400 lines).
- Consolidate around `@tiptap/markdown` for both directions, or fully own both directions in the custom code.

---

### 5. Massive Prop-Drilling — No Intermediate Context Layer

State from `App.tsx` is drilled through **3-4 component layers** before reaching consumers:

```
AppContentInner → BootloaderWrappedContent → VaultProviderWrapped → MainLayout → Editor/Sidebar/TabBar
```

All of `fileSystem`, `tabs`, `fileOperations`, `isFocusMode`, `isTypewriterMode`, and their setters are passed as individual props at every level. The `VaultProviderWrapped` component alone accepts **8 props** (all typed `any`).

**Fix:** Create an `EditorContext` or `AppStateContext` that provides `tabs`, `fileOperations`, and editor mode state. Components like `MainLayout`, `Sidebar`, and `TabBar` should consume from context, not props.

---

### 6. Duplicated Constants — `IMAGE_EXTENSIONS` Defined 3× 

The same image extension set is defined independently in:

| File | Constant | Extensions Included |
|------|----------|-------------------|
| `useFileSystem.ts:6` | `IMAGE_EXTENSIONS` | png, jpg, jpeg, gif, webp, bmp, svg, avif, tif, tiff, ico, heic, heif |
| `imageCache.ts:5` | `ATTACHMENT_IMAGE_EXTENSIONS` | Same set |
| `markdown.ts:34` | `IMAGE_EXTENSIONS` | png, jpg, jpeg, gif, webp, bmp, svg, avif, heic, heif, tiff, tif (**missing `ico`**) |

The `markdown.ts` version is also missing `ico`. This means the image parser may fail to recognize `.ico` files as images.

**Fix:** Define once in a shared `src/lib/constants.ts` or `src/lib/fs/types.ts` and import everywhere.

---

### 7. Repeated `normalizePathSeparators` Implementations

The helper `normalizePathSeparators(path: string): string` (replace `\` with `/`) is independently implemented in:
- `imageCache.ts:27`
- `imageIngestion.ts:88`
- Multiple inline usages in `useFileSystem.ts`, `useFileOperations.ts`

**Fix:** Define once in a shared utility module.

---

## 🟡 Medium Priority (Code Quality)

### 8. Magic String `'folium-graph'` Used as Tab ID

The string `'folium-graph'` is hardcoded in at least 5 locations:
- `App.tsx:238` — skip NoteTitle rendering
- `MainLayout.tsx:270` — switch to GraphView
- `MainLayout.tsx:277` — hide editor
- `useFileOperations.ts:248` — block PDF export
- `Sidebar.tsx` — open graph tab

**Fix:** Extract to a constant: `const GRAPH_TAB_ID = 'folium-graph'` in `useTabs.ts` or a constants file.

---

### 9. `performanceAudit.ts` — 504 Lines of Global Mutable State

This module uses **28+ module-level mutable variables** (lines 50–78) and is unconditionally imported in `App.tsx`. Despite its diagnostic value, the architecture has issues:

- All state is in module-scope `let` variables — no encapsulation
- Cleanup on hot-reload is fragile (consumer counting)
- `createAnimationFrameStep` recursively creates new closures on every frame instead of reusing one

**Fix:** Encapsulate in a `PerformanceAuditor` class or at minimum a factory function that returns a contained object. Consider making it tree-shakeable/lazy-loaded since most users won't enable it.

---

### 10. `useWordCount.ts` — Module-Level Timer + Custom Events

Word count uses a module-level `let wordCountDebounceTimer` variable and communicates via `window.dispatchEvent(new CustomEvent('folium:word-count', ...))`.

This is an anti-pattern because:
- Module-level state leaks across tests
- Custom events are a React anti-pattern (bypasses the render cycle)
- The debounce timer is shared globally, even if multiple editors exist (split pane)

**Fix:** Move to a React-native pattern: either a Zustand/Jotai atom, or a simple `useRef`-based debounce per editor instance.

---

### 11. `useEditorState.ts` — Overstuffed Hook (330 lines)

This hook handles:
- Tab sync + hydration
- Auto-save with debouncing
- Cursor/scroll state persistence
- Corruption detection
- External change detection
- Reference-style link preservation

**Fix:** Extract into smaller, composable hooks:
- `useAutoSave` — debounced save logic
- `useTabSync` — content hydration on tab switch
- `useExternalChangeDetector` — disk change monitoring

---

### 12. `useFileSystem.ts` — Repeated `scanDirectory + buildVaultIndex` Pattern

The pattern `scanDirectory()` → `buildVaultIndex()` → `setVault()` → `setImageCacheVaultImagePaths()` appears in **7 separate callbacks**: `loadVault`, `openVault`, `createFile`, `createFolder`, `renameFile`, `moveFile`, `deleteFile`, and `refreshTree`.

**Fix:** Extract a `refreshVault()` helper that encapsulates the scan-index-update cycle.

---

### 13. `useFileSystem.ts:108` — Dead Backlink Deletion Code

```typescript
for (const [, sources] of newIndex.entries()) {
    if (sources.has(noteName)) {
        const newSources = new Set(sources)
        newSources.delete(noteName)
        // ← newSources is created but never written back to newIndex
    }
}
```

The old-link cleanup creates a new `Set`, deletes from it, but **never assigns it back** to the map. The deletion is a no-op.

**Fix:** Replace with `newIndex.set(key, newSources)` after deletion, or switch to the `refreshTree` approach which rebuilds the full index.

---

### 14. Inconsistent Path Splitting

Across the codebase, file paths are split to extract filenames using various patterns:
- `path.split(/[\/\\]/).pop()` — most common
- `path.split('/').pop()` — in `imageCache.ts`
- `normalizePathSeparators(path).split('/').pop()` — in some places

This inconsistency can cause bugs on Windows paths.

**Fix:** Create a `getBasename(path: string)` utility that normalizes then splits.

---

### 15. `useSettings.tsx` — Config Saver Has Dependency Loop Risk

```typescript
// Line 37-52 — effect depends on configRef, but also sets configRef
useEffect(() => {
    if (!configRef) return
    // ...
    if (changed) {
        setConfigRef(newConfig)  // ← triggers re-run of this effect
        saveConfig(newConfig)
    }
}, [theme, fontSize, typewriterBlur, configRef])
```

`setConfigRef(newConfig)` will re-trigger the effect. The `changed` check prevents infinite loops, but the architecture is fragile.

**Fix:** Remove `configRef` from the dependency array and use a `useRef` instead of state for the config reference, since it doesn't drive rendering.

---

## 🟢 Low Priority (Cleanup)

### 16. Root-Level Clutter

The project root contains files that should be organized or removed:

| File | Issue |
|------|-------|
| `bug_resolution_nested_notes.md` | Stale debugging artifact |
| `folio-custom-titlebar-prd.md` | Old PRD (app was renamed to Folium) |
| `folio-prd.md`, `folio-prd.docx` | Old PRDs with "Folio" branding |
| `sync_implementation_prd_.md` | 58KB PRD with trailing underscore |
| `markdown_comparison.md` | Dev comparison document |
| `build.log` | Build artifact |
| `test-crlf.mjs`, `test-imports.ts`, `test-markdown.ts`, `test-wikilink-parse.ts` | Ad-hoc test scripts in project root |
| `Dockerfile` | Unclear if still relevant |

**Fix:** Move PRDs to a `docs/` folder, delete stale artifacts, move test scripts to `src/lib/__tests__/` or delete.

---

### 17. `@types/katex` in `dependencies` Instead of `devDependencies`

Line 39 of `package.json`:
```json
"@types/katex": "^0.16.8"
```

Type-only packages belong in `devDependencies`.

**Fix:** Move to `devDependencies`.

---

### 18. Both `pnpm-lock.yaml` and `package-lock.json` Exist

Having two lockfiles indicates the team has used both npm and pnpm. This causes confusion and potential dependency divergence.

**Fix:** Choose one package manager and delete the other lockfile.

---

### 19. Missing Error Boundaries on Async Operations

Many async callbacks in hooks use bare `try/catch` with `console.error` but don't surface errors to the user:
- `useFileSystem.ts` — vault loading, file operations
- `useFileOperations.ts` — new note, rename, move, delete
- `useEditorState.ts` — auto-save failures

Users get silent failures with no UI feedback.

**Fix:** Wire error catches to `modals.showToast(...)` or a dedicated error notification system.

---

### 20. SmoothCaret Extension — 11.9KB for One Feature

`SmoothCaret.ts` is nearly 12KB (biggest extension file) and contains its own animation loop, DOM manipulation, and coordinate computation.

**Fix:** Consider if this could be simplified with CSS `caret-color: transparent` + a pure-CSS animated pseudo-element approach, reducing both code surface and potential performance impact.

---

### 21. `OnboardingModal.tsx` — 21KB Component

At 21KB, this is the single largest component file. It likely contains presentation, logic, and state all in one file.

**Fix:** Extract into sub-components (steps/pages) and a dedicated hook for onboarding flow state.

---

### 22. `SettingsModal.tsx` — 25KB Component

Similar to OnboardingModal, this is extremely large for a single component (~700 lines). Settings sections should be split into individual panel components.

---

### 23. Console Logging in Production Paths

Numerous `console.log`, `console.info`, and `console.warn` statements exist in core save/load paths:
- `useEditorState.ts:99,101,256,260` — `[Folium Debug]` logs on every save
- `performanceAudit.ts` — extensive logging (some guarded by `enabled` flag)

**Fix:** Remove debug-tagged logs or gate behind `import.meta.env.DEV`.

---

### 24. Rust Backend — `set_var` Deprecated in Nightly

```rust
// lib.rs:24-26
std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
std::env::set_var("WEBKIT_SHARED_MEMORY_APPIMAGE", "1");
std::env::set_var("GDK_BACKEND", "x11");
```

`std::env::set_var` is being marked `unsafe` in future Rust editions due to thread safety. Since this runs before multi-threaded code, it's fine for now, but should be updated when Rust stabilizes the new API.

---

## Summary Matrix

| Priority | Count | Key Theme |
|----------|-------|-----------|
| 🔴 Critical | 3 | Type safety, stale closures, dead code |
| 🟠 High | 4 | Dual pipelines, prop-drilling, duplication |
| 🟡 Medium | 8 | Oversized hooks/modules, no-op code, fragile patterns |
| 🟢 Low | 9 | File organization, logging, cleanup |

---

## Recommended Refactoring Order

1. **Fix the stale closure bug** in `ModalContext.tsx` (5 min, prevents real bugs)
2. **Delete dead code**: `useTheme.tsx`, unused `markdownToTipTap` parser (saves ~450 lines)
3. **Fix the dead backlink deletion** in `useFileSystem.ts`
4. **Type the core APIs**: export types from `useFileSystem`, `useTabs`, `useFileOperations`
5. **Extract shared constants**: `IMAGE_EXTENSIONS`, `GRAPH_TAB_ID`, `normalizePathSeparators`
6. **Extract `refreshVault()` helper** in `useFileSystem.ts`
7. **Create `EditorContext`** to eliminate prop-drilling
8. **Split oversized hooks/components**: `useEditorState`, `OnboardingModal`, `SettingsModal`
9. **Clean up project root** and organize docs
10. **Gate console.log calls** behind dev check
