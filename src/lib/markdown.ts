import { parseWikilinkInner } from '../extensions/Wikilink';
import { IMAGE_EXTENSIONS as IMAGE_EXT_SET } from './constants';

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

export interface ReferenceStyleDefinition {
    label: string
    normalizedLabel: string
    url: string
    title: string | null
}

function isImagePath(src: string): boolean {
    const clean = src.split('#')[0].split('?')[0].toLowerCase()
    const dot = clean.lastIndexOf('.')
    if (dot === -1) return false
    return IMAGE_EXT_SET.has(clean.slice(dot + 1))
}

function defaultAltFromPath(src: string): string {
    const last = src.split(/[\/\\]/).pop() || src
    return last.replace(/\.[^.]+$/, '')
}

function parseObsidianImageSize(sizePart?: string): { width: number | null; height: number | null } {
    if (!sizePart) return { width: null, height: null }
    const trimmed = sizePart.trim()
    if (!trimmed) return { width: null, height: null }

    const both = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i)
    if (both) {
        return { width: Number(both[1]), height: Number(both[2]) }
    }

    const widthOnly = trimmed.match(/^(\d+)$/)
    if (widthOnly) {
        return { width: Number(widthOnly[1]), height: null }
    }

    return { width: null, height: null }
}

function parseHtmlImageNode(rawTag: string): TipTapNode | null {
    const attrs: Record<string, string> = {}
    const attrRegex = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
    let match: RegExpExecArray | null

    while ((match = attrRegex.exec(rawTag)) !== null) {
        const key = (match[1] || '').toLowerCase()
        const value = (match[3] ?? match[4] ?? match[5] ?? '').trim()
        if (!key || !value) continue
        attrs[key] = value
    }

    const src = attrs.src || ''
    if (!src) return null

    const width = normalizeDimension(attrs.width)
    const height = normalizeDimension(attrs.height)
    const alt = attrs.alt || defaultAltFromPath(src)
    const obsidian = attrs['data-obsidian'] === 'true'
    const align = attrs['data-align'] || attrs.align || null

    return {
        type: 'image',
        attrs: {
            src,
            alt,
            width,
            height,
            obsidian,
            align,
        },
    }
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
    const inlineRegex = /!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]|!\[(.*?)\]\((.+?)\)|(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~|\[\[(.*?)\]\]|\[(.+?)\]\((.+?)\))|<img\b[^>]*>/gi

    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = inlineRegex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index)
            if (before) addTextNode(nodes, before)
        }

        const token = match[0] || ''
        if (/^<img\b/i.test(token.trim())) {
            const imageNode = parseHtmlImageNode(token)
            if (imageNode) {
                nodes.push(imageNode)
            } else {
                addTextNode(nodes, token)
            }
        } else if (match[1] !== undefined) {
            // Obsidian wikilink embeds: image or note transclusion.
            const src = (match[1] || '').trim()
            if (isImagePath(src)) {
                const { width, height } = parseObsidianImageSize(match[2] || '')
                nodes.push({
                    type: 'image',
                    attrs: {
                        src,
                        alt: defaultAltFromPath(src),
                        width,
                        height,
                        obsidian: true,
                    },
                })
            } else {
                const { noteName, anchor } = parseWikilinkInner(src)
                if (noteName) {
                    nodes.push({
                        type: 'embed',
                        attrs: { noteName, anchor: anchor || null },
                    })
                } else {
                    addTextNode(nodes, match[0])
                }
            }
        } else if (match[3] !== undefined && match[4] !== undefined) {
            // Standard image ![alt](src)
            nodes.push({ type: 'image', attrs: { alt: match[3], src: match[4] } })
        } else if (match[6]) {
            // Bold
            nodes.push({ type: 'text', text: match[6], marks: [{ type: 'bold' }] })
        } else if (match[7]) {
            // Italic
            nodes.push({ type: 'text', text: match[7], marks: [{ type: 'italic' }] })
        } else if (match[8]) {
            // Code
            nodes.push({ type: 'text', text: match[8], marks: [{ type: 'code' }] })
        } else if (match[9]) {
            // Strike
            nodes.push({ type: 'text', text: match[9], marks: [{ type: 'strike' }] })
        } else if (match[10]) {
            // Wikilink
            const { noteName, anchor, alias } = parseWikilinkInner(match[10])
            nodes.push({ type: 'wikilink', attrs: { noteName, anchor, alias } })
        } else if (match[11] && match[12]) {
            // Link
            nodes.push({
                type: 'text',
                text: match[11],
                marks: [{ type: 'link', attrs: { href: match[12], target: '_blank' } }],
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

function normalizeReferenceLabel(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseReferenceTitle(match: RegExpMatchArray): string | null {
    return (match[3] ?? match[4] ?? match[5] ?? null) || null
}

function normalizeReferenceUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim()
    if (trimmed.startsWith('<') && trimmed.endsWith('>') && trimmed.length > 2) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

export function extractReferenceStyleDefinitions(markdown: string): ReferenceStyleDefinition[] {
    const lines = markdown.replace(/\r/g, '').split('\n')
    const out: ReferenceStyleDefinition[] = []
    const seen = new Set<string>()
    let inFence = false

    for (const line of lines) {
        const trimmed = line.trim()
        if (/^```/.test(trimmed)) {
            inFence = !inFence
            continue
        }
        if (inFence) continue

        const match = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/)
        if (!match) continue

        const label = (match[1] || '').trim()
        const normalizedLabel = normalizeReferenceLabel(label)
        const url = normalizeReferenceUrl(match[2] || '')
        const title = parseReferenceTitle(match)
        if (!label || !url || !normalizedLabel) continue
        if (seen.has(normalizedLabel)) continue

        seen.add(normalizedLabel)
        out.push({ label, normalizedLabel, url, title })
    }

    return out
}

function formatReferenceDefinition(definition: ReferenceStyleDefinition): string {
    if (!definition.title) {
        return `[${definition.label}]: ${definition.url}`
    }

    if (!definition.title.includes('"')) {
        return `[${definition.label}]: ${definition.url} "${definition.title}"`
    }

    if (!definition.title.includes("'")) {
        return `[${definition.label}]: ${definition.url} '${definition.title}'`
    }

    return `[${definition.label}]: ${definition.url} (${definition.title})`
}

function stripReferenceDefinitionLines(markdown: string): string {
    const lines = markdown.replace(/\r/g, '').split('\n')
    const kept: string[] = []
    let inFence = false

    for (const line of lines) {
        const trimmed = line.trim()
        if (/^```/.test(trimmed)) {
            inFence = !inFence
            kept.push(line)
            continue
        }

        if (!inFence && /^\s{0,3}\[[^\]]+\]:\s*(\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.test(line)) {
            continue
        }

        kept.push(line)
    }

    return kept.join('\n')
}

export function restoreReferenceStyleLinks(
    markdown: string,
    definitions: ReferenceStyleDefinition[],
): string {
    if (definitions.length === 0) return markdown

    const byExact = new Map<string, ReferenceStyleDefinition>()
    const byUrl = new Map<string, ReferenceStyleDefinition>()
    for (const definition of definitions) {
        const exactKey = `${definition.url}\u0000${definition.title || ''}`
        if (!byExact.has(exactKey)) byExact.set(exactKey, definition)
        if (!byUrl.has(definition.url)) byUrl.set(definition.url, definition)
    }

    const lines = markdown.replace(/\r/g, '').split('\n')
    const usedLabels = new Set<string>()
    let inFence = false

    const converted = lines.map((line) => {
        const trimmed = line.trim()
        if (/^```/.test(trimmed)) {
            inFence = !inFence
            return line
        }
        if (inFence) return line

        return line.replace(
            /(^|[^!])\[([^\]]+)\]\((<[^>\n]+>|[^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\)/g,
            (_whole, prefix: string, text: string, rawUrl: string, title1?: string, title2?: string, title3?: string) => {
                const url = normalizeReferenceUrl(rawUrl || '')
                const title = title1 ?? title2 ?? title3 ?? ''
                const exactKey = `${url}\u0000${title}`
                const match = byExact.get(exactKey) || byUrl.get(url)

                if (!match) {
                    return `${prefix}[${text}](${rawUrl}${title ? ` "${title}"` : ''})`
                }

                usedLabels.add(match.normalizedLabel)
                return `${prefix}[${text}][${match.label}]`
            }
        )
    }).join('\n')

    if (usedLabels.size === 0) return markdown

    const withoutDefinitions = stripReferenceDefinitionLines(converted).trimEnd()
    const definitionsToAppend = definitions
        .filter((definition) => usedLabels.has(definition.normalizedLabel))
        .map(formatReferenceDefinition)

    if (definitionsToAppend.length === 0) return withoutDefinitions
    return `${withoutDefinitions}\n\n${definitionsToAppend.join('\n')}`
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

            // For task items, the prefix is "- [x] " which is 6 characters.
            // Using 6 spaces for indentation causes parsers to treat nested items 
            // as indented code blocks. We strictly enforce a 2-space indent for task lists.
            const indentLength = node.type === 'taskItem' ? 2 : prefix.length
            const indent = ' '.repeat(indentLength)

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

function normalizeAttachmentSrc(src: string): string {
    if (!src) return src
    if (src.startsWith('data:') || src.startsWith('blob:')) return ''

    try {
        const decodedSrc = decodeURIComponent(src)
        if (
            (decodedSrc.startsWith('http://') || decodedSrc.startsWith('https://') || decodedSrc.startsWith('asset://') || decodedSrc.startsWith('tauri://')) &&
            decodedSrc.includes('localhost') &&
            decodedSrc.includes('/attachments/')
        ) {
            const parts = decodedSrc.split('/attachments/')
            return 'attachments/' + parts[parts.length - 1]
        }
    } catch {
        // Ignore decoding errors
    }

    return src
}

function normalizeDimension(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const asNumber = typeof value === 'number' ? value : Number(String(value))
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null
    return Math.round(asNumber)
}

function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function imageNodeToMarkdown(node: TipTapNode): string {
    const rawSrc = (node.attrs?.src as string) || ''
    const src = normalizeAttachmentSrc(rawSrc)
    if (!src) return ''

    const width = normalizeDimension(node.attrs?.width)
    const height = normalizeDimension(node.attrs?.height)
    const isObsidian = Boolean(node.attrs?.obsidian)
    const align = String(node.attrs?.align || '').trim()
    const alt = String(node.attrs?.alt || '')

    if (isObsidian || width || height) {
        if (!isObsidian) {
            const attrs: string[] = [`src="${escapeHtmlAttribute(src)}"`]
            if (alt) attrs.push(`alt="${escapeHtmlAttribute(alt)}"`)
            if (width) attrs.push(`width="${width}"`)
            if (height) attrs.push(`height="${height}"`)
            if (align) attrs.push(`data-align="${escapeHtmlAttribute(align)}"`)
            return `<img ${attrs.join(' ')} />`
        }

        let sizePart = ''
        if (width && height) sizePart = `|${width}x${height}`
        else if (width) sizePart = `|${width}`

        return `![[${src}${sizePart}]]`
    }

    return `![${alt}](${src})`
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

        case 'mathBlock':
            return `$$\n${node.attrs?.latex || ''}\n$$`
        case 'inlineMath':
            return `$${node.attrs?.math}$`

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

        case 'callout': {
            const type = (node.attrs?.type as string) || 'note'
            const title = (node.attrs?.title as string) || ''

            let foldChar = ''
            if (node.attrs?.foldable) {
                foldChar = node.attrs?.defaultExpanded ? '+' : '-'
            }

            const header = `> [!${type}]${foldChar}${title ? ' ' + title : ''}`
            const inner = arrayToMarkdown(node.content || [])
            const body = inner.split('\n').map(line => `> ${line}`).join('\n')

            return `${header}\n${body}`
        }

        case 'codeBlock': {
            const lang = (node.attrs?.language as string) || ''
            const code = node.content ? node.content.map(c => c.text || '').join('') : ''
            return `\`\`\`${lang}\n${code}\n\`\`\``
        }



        case 'embed': {
            const noteName = (node.attrs?.noteName as string) || ''
            const anchor = (node.attrs?.anchor as string) || ''
            return `![[${noteName}${anchor}]]`
        }

        case 'frontmatter': {
            const yaml = (node.attrs?.yaml as string) || ''
            return `---\n${yaml}\n---`
        }

        case 'image': {
            return imageNodeToMarkdown(node)
        }

        case 'table': {
            const rows = node.content || []
            let md = ''
            rows.forEach((row, rowIndex) => {
                const cells = row.content || []
                const rowMd = cells.map(cell => {
                    let cellText = ''
                    if (cell.content) {
                        // Tiptap table cells contain paragraphs.
                        // Markdown tables can't have raw newlines, so we replace them with <br>
                        cellText = (cell.content || [])
                            .map(c => nodeToMarkdown(c))
                            .join('<br>')
                            .replace(/\n\n/g, '<br>')
                            .replace(/\n/g, ' ')
                    }
                    return ` ${cellText.trim()} `
                }).join('|')

                md += `|${rowMd}|\n`

                // Markdown requires a divider row after the header
                if (rowIndex === 0) {
                    const divider = cells.map(() => ' --- ').join('|')
                    md += `|${divider}|\n`
                }
            })
            return md + '\n'
        }

        case 'horizontalRule':
            return '---'

        case 'hardBreak':
            return '\\\n'

        default:
            return inlineToMarkdown(node.content)
    }
}

function inlineToMarkdown(content?: TipTapNode[]): string {
    if (!content) return ''
    return content.map(node => {
        if (node.type === 'hardBreak') return '\\\n'
        if (node.type === 'wikilink') {
            const noteName = (node.attrs?.noteName as string) || ''
            const anchor = (node.attrs?.anchor as string) || ''
            const alias = (node.attrs?.alias as string) || ''
            let inner = noteName + anchor
            if (alias) {
                inner += '|' + alias
            }
            return `[[${inner}]]`
        }
        if (node.type === 'image') {
            return imageNodeToMarkdown(node)
        }

        if (node.type === 'tag') {
            return `#${node.attrs?.text || ''}`
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
                    case 'highlight':
                        text = `==${text}==`
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
