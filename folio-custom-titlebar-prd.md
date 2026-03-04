# Folio — Custom Titlebar
### Feature PRD & Implementation Guide · v1.0 · February 2026

---

## 1. Overview

Replace the default OS window chrome with a fully custom titlebar that integrates Folio's existing TabBar, making the app feel native and intentional rather than a web app inside a generic window frame.

**Current state:** Folio uses the default OS-provided titlebar — a plain bar with the app name and native window controls. It is visually disconnected from the rest of the UI and wastes vertical space that should belong to the tab system.

**Target state:** The TabBar becomes the titlebar. Window controls are drawn by Folio. The entire top bar is cohesive, draggable, and platform-aware. On macOS, native traffic lights are preserved. On Windows and Linux, custom controls match Folio's design language.

---

## 2. Goals

- Eliminate the default OS titlebar entirely on Windows and Linux
- Preserve native macOS traffic lights via `titleBarStyle: overlay`
- Make the TabBar region draggable so the window can be moved
- Implement custom minimize / maximize / close controls for Windows and Linux
- Support double-click to maximize on Windows and Linux
- Match the visual style of the existing dark and light themes

## 3. Non-Goals

- Right-click system menu on Windows (nice to have, deferred)
- Custom traffic light colours on macOS
- Animated window transitions
- Per-window titlebar customisation

---

## 4. Platform Behaviour Matrix

| Behaviour | Windows | macOS | Linux |
|---|---|---|---|
| Native titlebar removed | ✅ | ✅ (transparent overlay) | ✅ |
| Custom min/max/close buttons | ✅ | ❌ (native traffic lights kept) | ✅ |
| Drag to move window | ✅ | ✅ | ✅ |
| Double-click to maximise | ✅ | ✅ (native) | ✅ |
| Traffic lights position | N/A | Top-left, ~12px inset | N/A |

---

## 5. Design Specification

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Icon] [Tab 1] [Tab 2] [+ Add]        ············  [_ □ ×]    │  ← This entire bar is the titlebar
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        Editor content                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

On macOS:
```
┌─────────────────────────────────────────────────────────────────┐
│ ●●●  [Icon] [Tab 1] [Tab 2] [+ Add]        ············        │  ← Traffic lights preserved, no custom controls
├─────────────────────────────────────────────────────────────────┤
```

### 5.2 Window Controls (Windows & Linux)

Three buttons, right-aligned in the titlebar:

| Button | Icon | Hover colour (dark) | Hover colour (light) |
|---|---|---|---|
| Minimize | `─` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` |
| Maximize / Restore | `□` / `❐` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` |
| Close | `×` | `#e81123` (Windows red) | `#e81123` |

Button dimensions: 46px wide × 36px tall (Windows standard). Icon size: 16px.

### 5.3 Draggable Region

The entire TabBar background is draggable except:
- Tab items themselves
- The add tab button
- Window control buttons
- Any other interactive elements

### 5.4 macOS Traffic Light Spacing

Content in the TabBar must have `padding-left: 80px` on macOS to avoid overlapping the traffic lights. This value accounts for the three buttons plus safe margin.

---

## 6. Implementation — Step by Step

### Step 1 — Add window permissions to capabilities

Open `src-tauri/capabilities/default.json` and add window control permissions:

```json
{
  "permissions": [
    "core:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-remove-file",
    "fs:allow-rename",
    "dialog:allow-open",
    "dialog:allow-ask",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$HOME/**" },
        { "path": "$DOCUMENT/**" },
        { "path": "$DESKTOP/**" },
        { "path": "$APPCONFIG/**" }
      ]
    }
  ]
}
```

---

### Step 2 — Remove decorations in tauri.conf.json

Open `src-tauri/tauri.conf.json` and set `decorations: false` on the window:

```json
{
  "app": {
    "windows": [
      {
        "title": "Folio",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": false
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

> ⚠️ After this change, running `tauri dev` will open the window with no titlebar at all and no way to move or close it except via the terminal. This is expected — you're mid-implementation. Don't panic.

---

### Step 3 — Handle macOS titlebar overlay in lib.rs

macOS needs a different approach — keep native traffic lights but make the titlebar area transparent. Do this in Rust at startup:

Open `src-tauri/src/lib.rs` and update the `run()` function:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // macOS: use overlay titlebar to preserve native traffic lights
            // while allowing our content to extend into the titlebar area
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let window = app.get_webview_window("main")
                    .expect("main window not found");
                window.set_title_bar_style(TitleBarStyle::Overlay)?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### Step 4 — Create a platform detection utility

Create `src/lib/platform.ts`:

```typescript
/**
 * Platform detection utilities.
 * These are synchronous checks against the user agent / Tauri globals.
 * Safe to call anywhere — no async required.
 */

export const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI__' in window

export const isMacOS = (): boolean =>
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('mac')

export const isWindows = (): boolean =>
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('win')

export const isLinux = (): boolean =>
    typeof navigator !== 'undefined' &&
    !isMacOS() && !isWindows() &&
    navigator.userAgent.toLowerCase().includes('linux')

/**
 * Whether the current platform needs custom window controls drawn by us.
 * macOS keeps its native traffic lights — we don't draw buttons there.
 */
export const needsCustomWindowControls = (): boolean =>
    isTauri() && !isMacOS()
```

---

### Step 5 — Create the WindowControls component

Create `src/components/WindowControls.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Custom window control buttons for Windows and Linux.
 * Not rendered on macOS (native traffic lights are used instead).
 * Not rendered in browser (no window to control).
 */
export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        const win = getCurrentWindow()

        // Check initial maximized state
        win.isMaximized().then(setIsMaximized)

        // Listen for window resize events to update the maximize button icon
        const unlisten = win.onResized(() => {
            win.isMaximized().then(setIsMaximized)
        })

        return () => {
            unlisten.then(fn => fn())
        }
    }, [])

    const handleMinimize = async () => {
        await getCurrentWindow().minimize()
    }

    const handleMaximize = async () => {
        await getCurrentWindow().toggleMaximize()
    }

    const handleClose = async () => {
        await getCurrentWindow().close()
    }

    return (
        <div
            className="flex items-stretch h-full ml-auto"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            {/* Minimize */}
            <button
                onClick={handleMinimize}
                className="
                    window-control-btn
                    flex items-center justify-center
                    w-[46px] h-full
                    text-foreground/60 hover:text-foreground
                    hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-black/8
                    transition-colors duration-100
                    focus:outline-none
                "
                aria-label="Minimize"
                title="Minimize"
            >
                <MinimizeIcon />
            </button>

            {/* Maximize / Restore */}
            <button
                onClick={handleMaximize}
                className="
                    window-control-btn
                    flex items-center justify-center
                    w-[46px] h-full
                    text-foreground/60 hover:text-foreground
                    hover:bg-white/10 dark:hover:bg-white/10
                    transition-colors duration-100
                    focus:outline-none
                "
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
                title={isMaximized ? 'Restore' : 'Maximize'}
            >
                {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>

            {/* Close */}
            <button
                onClick={handleClose}
                className="
                    window-control-btn
                    flex items-center justify-center
                    w-[46px] h-full
                    text-foreground/60 hover:text-white
                    hover:bg-[#e81123]
                    transition-colors duration-100
                    focus:outline-none
                "
                aria-label="Close"
                title="Close"
            >
                <CloseIcon />
            </button>
        </div>
    )
}

// ── Icons ────────────────────────────────────────────────────────────────────
// Using raw SVG paths to avoid icon library dependencies in this
// system-critical component. Sized at 10px to match Windows/Linux conventions.

function MinimizeIcon() {
    return (
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
        </svg>
    )
}

function MaximizeIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
        </svg>
    )
}

function RestoreIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            {/* Front window */}
            <rect x="2.5" y="2.5" width="7" height="7" />
            {/* Back window offset */}
            <polyline points="2,2 2,0.5 9.5,0.5 9.5,8 8,8" />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
    )
}
```

---

### Step 6 — Update TabBar to be the titlebar

Open `src/components/TabBar.tsx` and make three changes:

**1. Import the new utilities and component:**
```typescript
import { needsCustomWindowControls, isMacOS, isTauri } from '../lib/platform'
import { WindowControls } from './WindowControls'
```

**2. Add the drag region style and macOS padding to the outer container:**
```typescript
// Replace your existing outer div with this:
<div
    className="flex items-center h-9 border-b border-border bg-background select-none"
    style={{
        // Makes the entire bar draggable as a window handle
        WebkitAppRegion: 'drag',
        // macOS: offset content right so it clears the traffic lights
        // Traffic lights are approximately 68px wide with standard insets
        paddingLeft: isTauri() && isMacOS() ? '80px' : undefined,
    } as React.CSSProperties}
    // Double-click to maximize/restore (Windows/Linux)
    onDoubleClick={async () => {
        if (needsCustomWindowControls()) {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            await getCurrentWindow().toggleMaximize()
        }
    }}
>
    {/* Tabs and other content — must opt out of drag */}
    <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center flex-1 overflow-hidden"
    >
        {/* ... your existing tab content here ... */}
    </div>

    {/* Window controls — only shown on Windows and Linux */}
    {needsCustomWindowControls() && <WindowControls />}
</div>
```

**3. Make sure every interactive element inside the tabs has `no-drag`:**

Any button, tab item, or clickable element inside the bar needs to opt out of the drag region or clicks won't register:

```typescript
// On each tab item:
style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}

// On the add tab button:
style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
```

---

### Step 7 — Add TypeScript type for WebkitAppRegion

The `-webkit-app-region` CSS property isn't in TypeScript's default React type definitions. Add a global declaration so the `as React.CSSProperties` cast works cleanly without errors.

Create or update `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

declare module 'react' {
    interface CSSProperties {
        WebkitAppRegion?: 'drag' | 'no-drag'
    }
}
```

---

### Step 8 — Prevent text selection on the titlebar

Users dragging the window should not accidentally select text. The `select-none` Tailwind class on the outer container handles most of this, but add it to `index.css` as a safety net for the titlebar area:

```css
/* Prevent text selection in the titlebar / drag region */
[style*="app-region: drag"] {
    user-select: none;
    -webkit-user-select: none;
}
```

---

### Step 9 — Test on each platform

Work through this checklist:

**Windows**
- [ ] Window opens without native titlebar
- [ ] Clicking and dragging the empty tab bar area moves the window
- [ ] Clicking tabs does not move the window
- [ ] Minimize button works
- [ ] Maximize button works, icon changes to restore icon
- [ ] Restore button works, icon changes back to maximize icon
- [ ] Close button works
- [ ] Close button turns red on hover
- [ ] Double-click empty area maximizes window
- [ ] Double-click again restores window

**macOS**
- [ ] Traffic lights (●●●) appear in the top-left
- [ ] Tab content does not overlap traffic lights
- [ ] Clicking and dragging the empty tab bar area moves the window
- [ ] No custom window control buttons appear (macOS uses native)
- [ ] Double-click titlebar area triggers macOS native maximize

**Linux**
- [ ] Behaves identically to Windows
- [ ] Drag region works (some compositors may require testing)

**Browser (web build)**
- [ ] `needsCustomWindowControls()` returns false — no buttons rendered
- [ ] No Tauri API imports are called
- [ ] No visual difference to current web layout

---

## 7. Rollback Plan

If something goes wrong mid-implementation, restore the native titlebar by reverting a single line in `tauri.conf.json`:

```json
"decorations": true   // restores native OS titlebar
```

And removing the `set_title_bar_style` call in `lib.rs`. Everything else is additive and can be left in place.

---

## 8. Files Changed Summary

| File | Change |
|---|---|
| `src-tauri/tauri.conf.json` | Add `decorations: false` to window config |
| `src-tauri/src/lib.rs` | Add macOS `TitleBarStyle::Overlay` setup |
| `src-tauri/capabilities/default.json` | Add window control permissions |
| `src/lib/platform.ts` | **New** — platform detection utilities |
| `src/components/WindowControls.tsx` | **New** — min/max/close button component |
| `src/components/TabBar.tsx` | Add drag region, macOS padding, mount WindowControls |
| `src/vite-env.d.ts` | Add `WebkitAppRegion` to CSSProperties type |
| `src/index.css` | Add user-select none for drag regions |

---

*Folio Custom Titlebar PRD · v1.0 · February 2026*
