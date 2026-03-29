import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion'
import WikilinkNodeView from '../components/WikilinkNodeView'

export interface WikilinkOptions {
    HTMLAttributes: Record<string, any>
    suggestion: Omit<SuggestionOptions, 'editor'>
}

/**
 * Parse the inner content of a wikilink `[[...]]` into structured components.
 * Handles all Obsidian variants:
 *   [[Note]]
 *   [[Note|Alias]]
 *   [[Note#Heading]]
 *   [[Note^block-id]]
 *   [[Note#Heading|Alias]]
 *   [[#Heading]]          (same-note anchor)
 *   [[^block-id]]         (same-note block ref)
 */
export function parseWikilinkInner(raw: string): { noteName: string; anchor: string; alias: string } {
    let noteName = ''
    let anchor = ''
    let alias = ''

    // Split alias first (last `|` wins)
    const pipeIdx = raw.indexOf('|')
    let linkPart = raw
    if (pipeIdx !== -1) {
        linkPart = raw.slice(0, pipeIdx)
        alias = raw.slice(pipeIdx + 1)
    }

    // Split anchor from link part (`#heading` or `^block-id`)
    const hashIdx = linkPart.indexOf('#')
    const caretIdx = linkPart.indexOf('^')
    const anchorIdx = hashIdx !== -1 ? hashIdx : caretIdx

    if (anchorIdx !== -1) {
        noteName = linkPart.slice(0, anchorIdx)
        anchor = linkPart.slice(anchorIdx)
    } else {
        noteName = linkPart
    }

    return { noteName, anchor, alias }
}

export const Wikilink = Node.create<WikilinkOptions>({
    name: 'wikilink',
    group: 'inline',
    inline: true,
    selectable: true,
    atom: true,

    addOptions() {
        return {
            HTMLAttributes: {},
            suggestion: {
                char: '[[',
                command: ({ editor, range, props }: { editor: any, range: any, props: any }) => {
                    props.command({ editor, range, props })
                },
            } as any, // Default empty config overridden by passing options
        }
    },

    addAttributes() {
        return {
            noteName: {
                default: null,
            },
            anchor: {
                default: null,
            },
            alias: {
                default: null,
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="wikilink"]',
                getAttrs: (element) => {
                    if (typeof element === 'string') return null
                    // If structured attributes exist, use them directly
                    const explicitAnchor = element.getAttribute('data-anchor')
                    const explicitAlias = element.getAttribute('data-alias')
                    if (explicitAnchor !== null || explicitAlias !== null) {
                        return {
                            noteName: element.getAttribute('data-note-name'),
                            anchor: explicitAnchor,
                            alias: explicitAlias,
                        }
                    }
                    // Otherwise, parse the raw data-note-name (e.g., "Note#Heading|Alias")
                    const raw = element.getAttribute('data-note-name') || ''
                    const parsed = parseWikilinkInner(raw)
                    return {
                        noteName: parsed.noteName,
                        anchor: parsed.anchor || null,
                        alias: parsed.alias || null,
                    }
                },
            },
        ]
    },

    renderHTML({ HTMLAttributes, node }) {
        return [
            'span',
            mergeAttributes(
                {
                    'data-type': 'wikilink',
                    'data-note-name': node.attrs.noteName,
                    'data-anchor': node.attrs.anchor,
                    'data-alias': node.attrs.alias,
                },
                this.options.HTMLAttributes,
                HTMLAttributes
            )
        ]
    },

    // ---- Markdown round-trip via @tiptap/markdown ----

    // Custom MarkedJS inline tokenizer so [[noteName#anchor|alias]] is recognised during parsing
    markdownTokenizer: {
        name: 'wikilink',
        level: 'inline',
        start(src: string) {
            return src.indexOf('[[')
        },
        tokenize(src: string) {
            const match = src.match(/^\[\[([^\]]+)\]\]/)
            if (match) {
                const { noteName, anchor, alias } = parseWikilinkInner(match[1])
                return {
                    type: 'wikilink',
                    raw: match[0],
                    noteName,
                    anchor,
                    alias,
                }
            }
            return undefined
        },
    },

    parseMarkdown(token: any) {
        return {
            type: 'wikilink',
            attrs: {
                noteName: token.noteName || '',
                anchor: token.anchor || null,
                alias: token.alias || null,
            },
        }
    },

    renderMarkdown(node: any) {
        const noteName = (node.attrs?.noteName as string) || ''
        const anchor = (node.attrs?.anchor as string) || ''
        const alias = (node.attrs?.alias as string) || ''

        let inner = `${noteName}${anchor}`
        if (alias) {
            inner += `|${alias}`
        }
        return `[[${inner}]]`
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ]
    },

    addNodeView() {
        return ReactNodeViewRenderer(WikilinkNodeView)
    },
})
