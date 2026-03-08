/**
 * Platform detection utilities.
 * These are synchronous checks against the user agent / Tauri globals.
 * Safe to call anywhere — no async required.
 */

export const isTauri = (): boolean =>
    typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

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
