/**
 * Heuristics to detect notes that may have been corrupted by older Folium parser versions.
 * Returns an array of human-readable warning strings (empty = no corruption detected).
 */
export function detectCorruption(raw: string): string[] {
    const warnings: string[] = []
    const lines = raw.split('\n')

    // 1. Mangled YAML frontmatter:
    //    If the very first line is `---` but is NOT followed by a closing `---` within the
    //    first 30 lines, it was likely already mangled into an HR + text by the old parser.
    //    However, if there IS a closing `---`, the frontmatter is intact (not corrupted) —
    //    but it will be stripped by stripFrontMatter(). We warn about a subtler case:
    //    If a note starts with a horizontal rule (<hr> or thematic break) immediately
    //    followed by key: value patterns, that's a sign the old parser already saved
    //    over the frontmatter.
    if (lines.length > 1) {
        // Old parser would turn `---` into an HR node, then the YAML content
        // would become plain paragraphs. After a save cycle the `---` stays but
        // the closing `---` would be gone (since it was interpreted as another HR
        // and merged with surrounding content).
        const firstLine = lines[0].trim()
        if (firstLine === '---') {
            let hasClosing = false
            for (let i = 1; i < Math.min(lines.length, 30); i++) {
                if (lines[i].trim() === '---') {
                    hasClosing = true
                    break
                }
            }
            if (!hasClosing) {
                // Check if lines after `---` look like YAML key-value pairs
                const yamlLike = lines.slice(1, 6).some(l => /^[a-zA-Z_][\w-]*\s*:/.test(l.trim()))
                if (yamlLike) {
                    warnings.push('YAML frontmatter appears to be incomplete (missing closing ---). It may have been altered by a previous save.')
                }
            }
        }
    }

    return warnings
}
