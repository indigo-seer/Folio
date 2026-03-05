/**
 * Markdown ↔ TipTap JSON conversion utilities.
 * 
 * - `markdownToTipTap`: Parse a .md file string into TipTap-compatible JSON content
 * - `tipTapToMarkdown`: Serialize TipTap JSON back to a .md string
 */

// ============================================================
// Types
// ============================================================

interface TipTapNode {
    type: string
    content?: TipTapNode[]
    text?: string
    marks?: TipTapMark[]
    attrs?: Record<string, unknown>
}

interface TipTapMark {
    type: string
    attrs?: Record<string, unknown>
}

// ============================================================
// Markdown → TipTap
// ============================================================

export function markdownToTipTap(markdown: string): { type: 'doc'; content: TipTapNode[] } {
    // Strip Windows \r line endings which break TipTap's text node renderer
    let cleaned = markdown.replace(/\r/g, '')

    // Strip YAML front-matter (common in files from Obsidian, VS Code, Hugo, etc.)
    // Front-matter starts at the very beginning of the file with '---' and ends with '---'
    if (cleaned.startsWith('---\n') || cleaned.startsWith('---\r\n')) {
        const endIndex = cleaned.indexOf('\n---', 3)
        if (endIndex !== -1) {
            // Skip past the closing '---' and any trailing newline
            cleaned = cleaned.slice(endIndex + 4).replace(/^\n/, '')
        }
    }

    const lines = cleaned.split('\n')
    const content = parseBlocks(lines)
    return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

function parseBlocks(lines: string[]): TipTapNode[] {
    const nodes: TipTapNode[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Empty line -> keep empty paragraphs
        if (line.trim() === '') {
            let blankCount = 0
            while (i < lines.length && lines[i].trim() === '') {
                blankCount++
                i++
            }

            // If it's the very beginning of the document/block (nodes.length === 0),
            // every blank line corresponds to an empty paragraph.
            // Otherwise, the first blank line acts as a block separator.
            const emptyParas = nodes.length === 0 ? blankCount : blankCount - 1

            for (let j = 0; j < emptyParas; j++) {
                nodes.push({ type: 'paragraph' })
            }
            continue
        }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
            nodes.push({ type: 'horizontalRule' })
            i++
            continue
        }

        // Fenced code block
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
                attrs: { language: lang },
                content: codeLines.length > 0
                    ? [{ type: 'text', text: codeLines.join('\n') }]
                    : undefined,
            })
            continue
        }

        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.*)/)
        if (headingMatch) {
            const level = headingMatch[1].length
            nodes.push({
                type: 'heading',
                attrs: { level },
                content: parseInline(headingMatch[2].trim()),
            })
            i++
            continue
        }

        // Blockquote
        if (line.trimStart().startsWith('> ')) {
            const quoteLines: string[] = []
            while (i < lines.length && (lines[i].trimStart().startsWith('> ') || lines[i].trimStart().startsWith('>'))) {
                quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
                i++
            }
            // Parse quote content recursively
            const quoteContent = parseBlocks(quoteLines)
            nodes.push({
                type: 'blockquote',
                content: quoteContent.length > 0 ? quoteContent : [{ type: 'paragraph' }],
            })
            continue
        }

        // Task list
        if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) {
            const items: TipTapNode[] = []
            while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[i])) {
                const checked = /^\s*[-*+]\s+\[[xX]\]\s/.test(lines[i])
                const itemText = lines[i].replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
                items.push({
                    type: 'taskItem',
                    attrs: { checked },
                    content: [{
                        type: 'paragraph',
                        content: parseInline(itemText),
                    }],
                })
                i++
                // Look ahead: only skip blank lines if the list continues
                let peek = i
                while (peek < lines.length && lines[peek].trim() === '') peek++
                if (peek < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[peek])) {
                    i = peek
                }
            }
            nodes.push({ type: 'taskList', content: items })
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
                // Look ahead: only skip blank lines if the list continues
                let peek = i
                while (peek < lines.length && lines[peek].trim() === '') peek++
                if (peek < lines.length && /^\s*[-*+]\s/.test(lines[peek])) {
                    i = peek
                }
            }
            nodes.push({ type: 'bulletList', content: items })
            continue
        }

        // Ordered list
        if (/^\s*\d+[.)]\s/.test(line)) {
            const items: TipTapNode[] = []
            while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
                const itemText = lines[i].replace(/^\s*\d+[.)]\s+/, '')
                items.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: parseInline(itemText),
                    }],
                })
                i++
                // Look ahead: only skip blank lines if the list continues
                let peek = i
                while (peek < lines.length && lines[peek].trim() === '') peek++
                if (peek < lines.length && /^\s*\d+[.)]\s/.test(lines[peek])) {
                    i = peek
                }
            }
            nodes.push({ type: 'orderedList', content: items })
            continue
        }

        // Regular paragraph — collect consecutive non-block lines
        const paraLines: string[] = []
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !isBlockStart(lines[i])
        ) {
            paraLines.push(lines[i])
            i++
        }
        if (paraLines.length > 0) {
            // Handle line breaks: two spaces at end of line or backslash
            const joined = paraLines.join('\n')
            nodes.push({
                type: 'paragraph',
                content: parseInline(joined),
            })
        }
    }

    return nodes
}

function isBlockStart(line: string): boolean {
    return /^#{1,6}\s/.test(line)
        || /^\s*[-*+]\s/.test(line)
        || /^\s*\d+[.)]\s/.test(line)
        || line.trimStart().startsWith('> ')
        || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())
        || line.trim().startsWith('```')
}

/**
 * Parse inline markdown to TipTap text nodes with marks.
 * Supports: **bold**, *italic*, `code`, ~~strike~~, [links](url)
 */
function parseInline(text: string): TipTapNode[] {
    const nodes: TipTapNode[] = []
    // Order matters: images ![]() must parse before links []()
    // Bold before italic since ** contains *
    const inlineRegex = /!\[(.*?)\]\((.+?)\)|(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~|\[\[(.*?)\]\]|\[(.+?)\]\((.+?)\))/g

    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = inlineRegex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index)
            if (before) addTextNode(nodes, before)
        }

        // Image match: group 1 = alt, group 2 = src
        if (match[1] !== undefined && match[2] !== undefined) {
            nodes.push({ type: 'image', attrs: { alt: match[1], src: match[2] } })
        } else if (match[4]) {
            // Bold
            nodes.push({ type: 'text', text: match[4], marks: [{ type: 'bold' }] })
        } else if (match[5]) {
            // Italic
            nodes.push({ type: 'text', text: match[5], marks: [{ type: 'italic' }] })
        } else if (match[6]) {
            // Code
            nodes.push({ type: 'text', text: match[6], marks: [{ type: 'code' }] })
        } else if (match[7]) {
            // Strike
            nodes.push({ type: 'text', text: match[7], marks: [{ type: 'strike' }] })
        } else if (match[8]) {
            // Wikilink
            nodes.push({ type: 'wikilink', attrs: { noteName: match[8] } })
        } else if (match[9] && match[10]) {
            // Link
            nodes.push({
                type: 'text',
                text: match[9],
                marks: [{ type: 'link', attrs: { href: match[10], target: '_blank' } }],
            })
        }

        lastIndex = match.index + match[0].length
    }

    // Remaining text
    if (lastIndex < text.length) {
        addTextNode(nodes, text.slice(lastIndex))
    }

    if (nodes.length === 0 && text) {
        addTextNode(nodes, text)
    }

    return nodes
}

function addTextNode(nodes: TipTapNode[], text: string): void {
    // Handle newlines within paragraphs as hard breaks
    const parts = text.split('\n')
    parts.forEach((part, idx) => {
        if (part) nodes.push({ type: 'text', text: part })
        if (idx < parts.length - 1) nodes.push({ type: 'hardBreak' })
    })
}

// ============================================================
// TipTap → Markdown
// ============================================================

export function tipTapToMarkdown(doc: { type: string; content?: TipTapNode[] }): string {
    if (!doc.content) return ''
    return arrayToMarkdown(doc.content)
}

function arrayToMarkdown(nodes: TipTapNode[]): string {
    let result = ''
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]

        const isParagraph = node.type === 'paragraph'
        const mdText = isParagraph ? nodeToMarkdown(node) : null
        const isCurrEmptyPara = isParagraph && mdText === ''
        const text = isCurrEmptyPara ? '' : (isParagraph ? mdText! : nodeToMarkdown(node))

        if (i === 0) {
            result += text
        } else {
            const prevNode = nodes[i - 1]
            const prevIsParagraph = prevNode.type === 'paragraph'
            const prevMdText = prevIsParagraph ? nodeToMarkdown(prevNode) : null
            const isPrevEmptyPara = prevIsParagraph && prevMdText === ''

            if (isCurrEmptyPara && isPrevEmptyPara) {
                result += '\n'
            } else if (isCurrEmptyPara && !isPrevEmptyPara) {
                result += '\n\n'
            } else if (!isCurrEmptyPara && isPrevEmptyPara) {
                result += '\n' + text
            } else {
                result += '\n\n' + text
            }
        }
    }
    return result
}

function nodeToMarkdownItem(node: TipTapNode, prefix: string): string {
    if (node.type === 'listItem' || node.type === 'taskItem') {
        const inner = arrayToMarkdown(node.content || [])
        const lines = inner.split('\n')
        if (lines.length > 0) {
            lines[0] = prefix + lines[0]
            const indent = ' '.repeat(prefix.length)
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() !== '') {
                    lines[i] = indent + lines[i]
                }
            }
        }
        return lines.join('\n')
    }
    return prefix + nodeToMarkdown(node)
}

function nodeToMarkdown(node: TipTapNode): string {
    switch (node.type) {
        case 'heading': {
            const level = (node.attrs?.level as number) || 1
            const hashes = '#'.repeat(level)
            return `${hashes} ${inlineToMarkdown(node.content)}`
        }

        case 'paragraph':
            return inlineToMarkdown(node.content)

        case 'bulletList':
            return (node.content || [])
                .map(item => nodeToMarkdownItem(item, '- '))
                .join('\n')

        case 'orderedList':
            return (node.content || [])
                .map((item, idx) => nodeToMarkdownItem(item, `${idx + 1}. `))
                .join('\n')

        case 'listItem':
            return nodeToMarkdownItem(node, '')

        case 'taskList':
            return (node.content || [])
                .map(item => nodeToMarkdown(item))
                .join('\n')

        case 'taskItem': {
            const checked = node.attrs?.checked ? 'x' : ' '
            return nodeToMarkdownItem(node, `- [${checked}] `)
        }

        case 'blockquote': {
            const inner = arrayToMarkdown(node.content || [])
            return inner.split('\n').map(line => `> ${line}`).join('\n')
        }

        case 'codeBlock': {
            const lang = (node.attrs?.language as string) || ''
            const code = node.content ? node.content.map(c => c.text || '').join('') : ''
            return `\`\`\`${lang}\n${code}\n\`\`\``
        }

        case 'image': {
            let src = (node.attrs?.src as string) || ''
            if (src.startsWith('data:') || src.startsWith('blob:')) return ''

            // Revert Tauri asset display URLs back to portable relative paths
            try {
                const decodedSrc = decodeURIComponent(src)
                if (
                    (decodedSrc.startsWith('http://') || decodedSrc.startsWith('https://') || decodedSrc.startsWith('asset://') || decodedSrc.startsWith('tauri://')) &&
                    decodedSrc.includes('localhost') &&
                    decodedSrc.includes('/attachments/')
                ) {
                    const parts = decodedSrc.split('/attachments/')
                    src = 'attachments/' + parts[parts.length - 1]
                }
            } catch {
                // Ignore decoding errors
            }

            return `![${(node.attrs?.alt as string) || ''}](${src})`
        }

        case 'horizontalRule':
            return '---'

        case 'hardBreak':
            return '  \n'

        default:
            return inlineToMarkdown(node.content)
    }
}

function inlineToMarkdown(content?: TipTapNode[]): string {
    if (!content) return ''
    return content.map(node => {
        if (node.type === 'hardBreak') return '  \n'
        if (node.type === 'wikilink') return `[[${(node.attrs?.noteName as string) || ''}]]`
        if (node.type === 'image') {
            let src = (node.attrs?.src as string) || ''
            if (src.startsWith('data:') || src.startsWith('blob:')) return ''

            try {
                const decodedSrc = decodeURIComponent(src)
                if (
                    (decodedSrc.startsWith('http://') || decodedSrc.startsWith('https://') || decodedSrc.startsWith('asset://') || decodedSrc.startsWith('tauri://')) &&
                    decodedSrc.includes('localhost') &&
                    decodedSrc.includes('/attachments/')
                ) {
                    const parts = decodedSrc.split('/attachments/')
                    src = 'attachments/' + parts[parts.length - 1]
                }
            } catch {
                // Ignore decoding errors
            }

            return `![${(node.attrs?.alt as string) || ''}](${src})`
        }

        if (!node.text) return ''

        let text = node.text
        if (node.marks) {
            for (const mark of node.marks) {
                switch (mark.type) {
                    case 'bold':
                        text = `**${text}**`
                        break
                    case 'italic':
                        text = `*${text}*`
                        break
                    case 'code':
                        text = `\`${text}\``
                        break
                    case 'strike':
                        text = `~~${text}~~`
                        break
                    case 'link':
                        text = `[${text}](${(mark.attrs?.href as string) || ''})`
                        break
                }
            }
        }
        return text
    }).join('')
}
