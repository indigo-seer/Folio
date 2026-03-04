import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion'
import WikilinkNodeView from '../components/WikilinkNodeView'

export interface WikilinkOptions {
    HTMLAttributes: Record<string, any>
    suggestion: Omit<SuggestionOptions, 'editor'>
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
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="wikilink"]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ 'data-type': 'wikilink' }, this.options.HTMLAttributes, HTMLAttributes)]
    },

    // ---- Markdown round-trip via @tiptap/markdown ----

    // Custom MarkedJS inline tokenizer so [[noteName]] is recognised during parsing
    markdownTokenizer: {
        name: 'wikilink',
        level: 'inline',
        start(src: string) {
            return src.indexOf('[[')
        },
        tokenize(src: string) {
            const match = src.match(/^\[\[([^\]]+)\]\]/)
            if (match) {
                return {
                    type: 'wikilink',
                    raw: match[0],
                    noteName: match[1],
                }
            }
            return undefined
        },
    },

    parseMarkdown(token: any) {
        return {
            type: 'wikilink',
            attrs: { noteName: token.noteName || '' },
        }
    },

    renderMarkdown(node: any) {
        const noteName = (node.attrs?.noteName as string) || ''
        return `[[${noteName}]]`
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
