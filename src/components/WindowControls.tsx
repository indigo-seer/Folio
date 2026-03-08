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
                    hover:bg-black/10 dark:hover:bg-white/10
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
                    hover:bg-black/10 dark:hover:bg-white/10
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
        <svg fill="currentColor" width="11" height="11" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="5" width="9" height="1" />
        </svg>
    )
}

function MaximizeIcon() {
    return (
        <svg fill="none" stroke="currentColor" strokeWidth="1" width="11" height="11" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="1.5" width="8" height="8" />
        </svg>
    )
}

function RestoreIcon() {
    return (
        <svg fill="none" stroke="currentColor" strokeWidth="1" width="11" height="11" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg">
            {/* Back square */}
            <path d="M3.5,1.5 h5.5 v5.5" strokeLinecap="square" />
            <path d="M3.5,3.5 h-2 v5.5 h5.5 v-2" strokeLinecap="square" />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg fill="currentColor" width="11" height="11" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.2,1.5 L5.5,4.8 L8.8,1.5 L9.5,2.2 L6.2,5.5 L9.5,8.8 L8.8,9.5 L5.5,6.2 L2.2,9.5 L1.5,8.8 L4.8,5.5 L1.5,2.2 Z" />
        </svg>
    )
}
