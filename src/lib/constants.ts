/**
 * Shared constants used across the Folium codebase.
 * Import from here instead of re-defining in individual files.
 */

/**
 * File extensions recognised as images.
 * Used in file-system scanning, markdown parsing, and image cache logic.
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif',
    'tif', 'tiff', 'ico', 'heic', 'heif',
])

/**
 * Subset of IMAGE_EXTENSIONS that can be raster-cached (excludes SVG).
 */
export const RASTER_CACHE_EXTENSIONS: ReadonlySet<string> = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif',
    'tif', 'tiff', 'ico', 'heic', 'heif',
])

/**
 * The special tab ID used for the Graph View.
 * This is not a file path — it is a sentinel value that triggers
 * graph rendering instead of the markdown editor.
 */
export const GRAPH_TAB_ID = 'folium-graph'

/**
 * Normalises file-path separators to forward slashes for cross-platform
 * consistency. Windows paths use backslashes; all internal logic should use
 * forward slashes after normalising.
 */
export function normalizePathSeparators(path: string): string {
    return path.replace(/\\/g, '/')
}

/**
 * Extracts the final segment of a file path (the "basename"),
 * handling both forward and back slashes.
 *
 * @example
 * getBasename('/vault/notes/My Note.md') // 'My Note.md'
 * getBasename('C:\\vault\\notes\\My Note.md') // 'My Note.md'
 */
export function getBasename(path: string): string {
    return normalizePathSeparators(path).split('/').pop() ?? path
}
