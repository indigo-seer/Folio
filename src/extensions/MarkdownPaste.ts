import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Custom TipTap extension that intercepts pasted plain text,
 * detects markdown patterns, and converts them to TipTap nodes.
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

                        // Only handle plain text paste (not HTML paste from other rich sources)
                        const html = clipboardData.getData('text/html')
                        if (html) return false

                        const text = clipboardData.getData('text/plain')
                        if (!text) return false

                        // Check if this looks like markdown
                        if (!looksLikeMarkdown(text)) return false

                        event.preventDefault()
                        const tiptapContent = markdownToTipTap(text)
                        editor.chain().focus().insertContent(tiptapContent).run()
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
        /^\s*[-*+]\s/m,         // unordered lists
        /^\s*\d+\.\s/m,         // ordered lists
        /\*\*.+?\*\*/,          // bold
        /\*.+?\*/,              // italic
        /`.+?`/,                // inline code
        /^>\s/m,                // blockquotes
        /^---\s*$/m,            // horizontal rule
        /^```/m,                // code fences
    ]
    let matches = 0
    for (const pattern of mdPatterns) {
        if (pattern.test(text)) matches++
    }
    // At least 2 patterns or a heading to trigger markdown parsing
    return matches >= 2 || /^#{1,6}\s/m.test(text)
}

interface TipTapNode {
    type: string
    content?: TipTapNode[]
    text?: string
    marks?: { type: string }[]
    attrs?: Record<string, unknown>
}

/**
 * Convert markdown text to TipTap JSON content.
 * Handles headings, lists, blockquotes, bold, italic, code, and horizontal rules.
 */
function markdownToTipTap(markdown: string): TipTapNode[] {
    const lines = markdown.split('\n')
    const nodes: TipTapNode[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines
        if (line.trim() === '') {
            i++
            continue
        }

        // Horizontal rule
        if (/^---\s*$/.test(line.trim()) || /^\*\*\*\s*$/.test(line.trim())) {
            nodes.push({ type: 'horizontalRule' })
            i++
            continue
        }

        // Code block (fenced)
        if (line.trim().startsWith('```')) {
            const lang = line.trim().slice(3).trim() || null
            const codeLines: string[] = []
            i++
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            i++ // skip closing ```
            nodes.push({
                type: 'codeBlock',
                attrs: lang ? { language: lang } : {},
                content: [{ type: 'text', text: codeLines.join('\n') }],
            })
            continue
        }

        // Heading
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
        if (headingMatch) {
            const level = headingMatch[1].length
            nodes.push({
                type: 'heading',
                attrs: { level },
                content: parseInline(headingMatch[2]),
            })
            i++
            continue
        }

        // Blockquote
        if (line.trimStart().startsWith('> ')) {
            const quoteLines: string[] = []
            while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
                quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
                i++
            }
            nodes.push({
                type: 'blockquote',
                content: [{
                    type: 'paragraph',
                    content: parseInline(quoteLines.join(' ')),
                }],
            })
            continue
        }

        // Unordered list
        if (/^\s*[-*+]\s/.test(line)) {
            const items: TipTapNode[] = []
            while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
                const itemText = lines[i].replace(/^\s*[-*+]\s+/, '')
                items.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: parseInline(itemText),
                    }],
                })
                i++
                // Skip empty lines between list items
                while (i < lines.length && lines[i].trim() === '') i++
            }
            nodes.push({ type: 'bulletList', content: items })
            continue
        }

        // Ordered list
        if (/^\s*\d+\.\s/.test(line)) {
            const items: TipTapNode[] = []
            while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
                const itemText = lines[i].replace(/^\s*\d+\.\s+/, '')
                items.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: parseInline(itemText),
                    }],
                })
                i++
                while (i < lines.length && lines[i].trim() === '') i++
            }
            nodes.push({ type: 'orderedList', content: items })
            continue
        }

        // Regular paragraph
        const paraLines: string[] = []
        while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
            paraLines.push(lines[i])
            i++
        }
        if (paraLines.length > 0) {
            nodes.push({
                type: 'paragraph',
                content: parseInline(paraLines.join(' ')),
            })
        } else {
            i++
        }
    }

    return nodes
}

function isBlockStart(line: string): boolean {
    return /^#{1,6}\s/.test(line)
        || /^\s*[-*+]\s/.test(line)
        || /^\s*\d+\.\s/.test(line)
        || line.trimStart().startsWith('> ')
        || /^---\s*$/.test(line.trim())
        || line.trim().startsWith('```')
}

/**
 * Parse inline markdown (bold, italic, code, strikethrough) into TipTap text nodes with marks.
 */
function parseInline(text: string): TipTapNode[] {
    const nodes: TipTapNode[] = []
    // Regex to match inline patterns: **bold**, *italic*, `code`, ~~strike~~
    const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~)/g

    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = inlineRegex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index)
            if (before) nodes.push({ type: 'text', text: before })
        }

        if (match[2]) {
            // Bold **text**
            nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] })
        } else if (match[3]) {
            // Italic *text*
            nodes.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] })
        } else if (match[4]) {
            // Code `text`
            nodes.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] })
        } else if (match[5]) {
            // Strikethrough ~~text~~
            nodes.push({ type: 'text', text: match[5], marks: [{ type: 'strike' }] })
        }

        lastIndex = match.index + match[0].length
    }

    // Remaining text
    if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex)
        if (remaining) nodes.push({ type: 'text', text: remaining })
    }

    // If nothing was parsed, return the raw text
    if (nodes.length === 0 && text) {
        nodes.push({ type: 'text', text })
    }

    return nodes
}
