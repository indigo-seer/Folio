import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Custom TipTap extension that intercepts pasted plain text,
 * detects markdown patterns, and parses them natively using @tiptap/markdown.
 */
export const MarkdownPaste = Extension.create({
    name: 'markdownPaste',

    addProseMirrorPlugins() {
        const editor = this.editor

        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste(_view, event) {
                        const clipboardData = event.clipboardData
                        if (!clipboardData) return false

                        const text = clipboardData.getData('text/plain')
                        if (!text) return false

                        const bookmarkUrl = normalizeBookmarkUrl(text)
                        if (bookmarkUrl) {
                            event.preventDefault()
                            editor
                                .chain()
                                .focus()
                                .insertContent(`![[${bookmarkUrl}]]`, {
                                    parseOptions: { preserveWhitespace: 'full' },
                                    contentType: 'markdown',
                                } as any)
                                .run()
                            return true
                        }

                        // Only handle plain text markdown paste (not HTML paste from rich sources)
                        const html = clipboardData.getData('text/html')
                        if (html) return false

                        // Check if this looks like markdown
                        if (!looksLikeMarkdown(text)) return false

                        event.preventDefault()

                        // Delegate to @tiptap/markdown's native parser
                        editor.chain().focus().insertContent(text, {
                            parseOptions: { preserveWhitespace: "full" },
                            contentType: 'markdown'
                        } as any).run()

                        return true
                    },
                },
            }),
        ]
    },
})

/**
 * Quick heuristic: does this text contain markdown patterns?
 */
function looksLikeMarkdown(text: string): boolean {
    const mdPatterns = [
        /^#{1,6}\s/m,           // headings
        /^\s*[-*+]\s/m,         // unordered and task lists
        /^\s*\d+\.\s/m,         // ordered lists
        /\*\*.+?\*\*/,          // bold
        /\*.+?\*/,              // italic
        /`.+?`/,                // inline code
        /^>\s/m,                // blockquotes
        /^---\s*$/m,            // horizontal rule
        /^```/m,                // code fences
        /\[\[.+?\]\]/,          // wikilinks
        /\[.+?\]\(.+?\)/,       // standard links
        /==.+?==/,              // highlights
        /^\|.+\|$/m,            // tables
    ]
    let matches = 0
    for (const pattern of mdPatterns) {
        if (pattern.test(text)) matches++
    }
    return matches >= 2 || /^#{1,6}\s/m.test(text) || /^.+\n[=-]{2,}\s*$/m.test(text) || /^\s*[-*+]\s/m.test(text) || /\[\[.+?\]\]/.test(text)
}

function normalizeBookmarkUrl(input: string): string | null {
    const trimmed = String(input || '').trim()
    if (!trimmed) return null
    if (/\s/.test(trimmed)) return null

    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    const looksLikeWww = /^www\./i.test(trimmed)
    if (!hasScheme && !looksLikeWww) return null

    const candidate = looksLikeWww ? `https://${trimmed}` : trimmed

    try {
        const parsed = new URL(candidate)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.toString()
    } catch {
        return null
    }
}
