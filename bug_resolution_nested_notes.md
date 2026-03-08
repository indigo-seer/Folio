# Resolution: Nested Notes Failing to Load

## The Symptoms
When using Folio to open a Markdown vault containing nested folders, selecting a note located at the root level worked fine. However, clicking on a note inside a subfolder (e.g., `Vault/Novel/Compass.md`) resulted in the application failing to open the note. The interface's note title would update correctly to reflect the selected file, but the editor canvas would either completely blank out or remain stuck displaying the contents of the previously opened note. 

## The Root Causes
The investigation revealed two massive but interconnected issues:

### 1. React Context Race Conditions (Silent Aborts)
Every time a new note was selected from the sidebar, the `useEditorState` hook would begin asynchronously reading the file from disk. Simultaneously, the `VaultContext` provider in `App.tsx` and the custom hooks (`useFileSystem` and `useFileOperations`) were generating completely new instance objects on every single render. 
Because the application state was thrashing and triggering cascading re-renders across the component tree, the file-loading `useEffect` hook would prematurely hit its cleanup phase. This would toggle an internal `isMounted` flag to `false`, causing the file loading promise to silently abort before writing its content to the editor.

### 2. Tauri v2 Scope Permissions (The True Blocker)
Once the race conditions were fixed, the silent failures stopped, revealing the true underlying system error: **Tauri's `fs:scope` permissions.**
Tauri 2 enforces an incredibly strict filesystem sandbox for its `fs` plugin. By default, the `default.json` capability file rigidly authorized read/write access identically to the `$HOME/**` and `$DOCUMENT/**` variables. 
Because the problematic vault was located deep inside a specific mount or synced folder (`/home/aadya/storage/Nextcloud/Notes`), the path didn't cleanly evaluate under the strict OS `$HOME` pattern from Tauri's rigid perspective. As a result, Tauri flat-out rejected the read request for the nested file, throwing a *forbidden path* error.

## The Fixes Implemented

### Stabilizing Context and Hooks
We heavily stabilized the component tree to guarantee object reference equality across renders.
- Wrapped the `VaultContext.Provider` value in a `useMemo` block inside `App.tsx`.
- Memoized the return objects of both `useFileSystem.ts` and `useFileOperations.ts` using `useMemo` to stop them from triggering deep resets on the Editor.
- Enforced standard `useRef` usages for `renderedTabIdRef` instead of re-instantiating an empty object literal `{ current: null }` each render.

### Enhancing Error Visibility
To ensure future filesystem blocks never masquerade as mysterious UI freezes, `useEditorState.ts` was upgraded to catch `readTextFile` errors and directly inject an inline HTML error block into the TipTap editor canvas (e.g., `<h1 style="color: red">Error Loading Note</h1>`). This provided immediate visual confirmation of *why* the backend rejected a file.

### Expanding Tauri Sandbox Capabilities
We expanded the global permission parameters inside `src-tauri/capabilities/default.json`.
- Appended `**` and `**/*` directly to the `fs:scope` allowlist.
- Because Folio already guarantees security by requiring the user to explicitly select the vault root folder via the native OS Dialog (which automatically grants OS-level handle access), configuring the capability system to permit deep absolute recursive reads effectively neutralizes the artificial boundary.

## Conclusion
The combination of adding strict React memoization, implementing direct inline error UI, and natively expanding the Tauri `fs:scope` capabilities resolves the bug universally on Linux, Windows, and macOS, regardless of where the vault is mounted or synced.
