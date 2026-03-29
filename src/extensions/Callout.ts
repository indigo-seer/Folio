import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import CalloutNodeView from '../components/CalloutNodeView.tsx'

/**
 * Extension to support Obsidian-style Callouts (Admonitions)
 * Syntax:
 * > [!info] Title
 * > Body
 */
export const Callout = Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,

    addAttributes() {
        return {
            type: {
                default: 'note',
            },
            title: {
                default: '',
            },
            foldable: {
                default: false,
            },
            defaultExpanded: {
                default: true,
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="callout"]',
                getAttrs: (node: HTMLElement | string) => {
                    if (typeof node === 'string') return null
                    return {
                        type: node.getAttribute('data-callout-type'),
                        title: node.getAttribute('data-callout-title'),
                        foldable: node.hasAttribute('data-callout-foldable'),
                        defaultExpanded: node.getAttribute('data-callout-expanded') !== 'false',
                    }
                },
            },
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        const attrs: Record<string, any> = {
            'data-type': 'callout',
            'data-callout-type': HTMLAttributes.type || 'note',
            'data-callout-title': HTMLAttributes.title || '',
            'data-callout-expanded': HTMLAttributes.defaultExpanded === false ? 'false' : 'true',
        }

        if (HTMLAttributes.foldable) {
            attrs['data-callout-foldable'] = 'true'
        }

        return ['div', mergeAttributes(HTMLAttributes, attrs), 0]
    },

    addNodeView() {
        return ReactNodeViewRenderer(CalloutNodeView)
    },

    // ---- Markdown parsing mapping via @tiptap/markdown ----
    markdownToken: 'callout',

    // Inject custom MarkedJS block tokenizer to catch "> [!type]" before regular blockquote
    markdownTokenizer: {
        name: 'callout',
        level: 'block',
        start(src: string) {
            return src.match(/^> \s*\[![a-zA-Z0-9-]+\]/i)?.index ?? -1
        },
        tokenize(src: string, _: any, helper: any) {
            // Match the ENTIRE contiguous blockquote block
            const rule = /^(?:> [^\n]*(?:\n|$))+/
            const match = rule.exec(src)

            if (match) {
                const firstLineRule = /^> \s*\[!([a-zA-Z0-9-]+)\]([-+]?)\s*(.*)/i
                const lines = match[0].split('\n')
                const firstLine = lines[0]
                const firstLineMatch = firstLineRule.exec(firstLine)

                if (firstLineMatch) {
                    const type = firstLineMatch[1].toLowerCase()
                    const fold = firstLineMatch[2]
                    const title = firstLineMatch[3].trim()

                    // Extract inner content (strip "> " from all lines)
                    // Discard the first line since it's the callout metadata
                    const contentLines = lines.slice(1).map(l => l.replace(/^> ?/, ''))

                    // Remove trailing empty lines that might have been part of the block
                    let endIndex = contentLines.length - 1
                    while (endIndex >= 0 && contentLines[endIndex].trim() === '') {
                        endIndex--
                    }
                    const contentStr = contentLines.slice(0, endIndex + 1).join('\n')

                    const token = {
                        type: 'callout',
                        raw: match[0],
                        calloutType: type,
                        calloutTitle: title,
                        foldable: fold === '-' || fold === '+',
                        defaultExpanded: fold !== '-',
                        tokens: [],
                    }

                    // Parse inner content recursively
                    if (contentStr) {
                        token.tokens = helper.blockTokens(contentStr)
                    }

                    return token
                }
            }
            return undefined
        }
    },

    // @ts-ignore: custom property
    parseMarkdown(token: any, helpers: any) {
        return {
            type: 'callout',
            attrs: {
                type: token.calloutType,
                title: token.calloutTitle || (token.calloutType?.charAt(0).toUpperCase() + token.calloutType?.slice(1)),
                foldable: token.foldable,
                defaultExpanded: token.defaultExpanded,
            },
            content: token.tokens ? helpers.parseChildren(token.tokens) : []
        }
    },
} as any)
