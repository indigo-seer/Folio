import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import TagNodeView from '../components/TagNodeView.tsx'

export interface TagOptions {
    HTMLAttributes: Record<string, any>
}

export const Tag = Node.create<TagOptions>({
    name: 'tag',
    group: 'inline',
    inline: true,
    selectable: true,
    atom: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        }
    },

    addAttributes() {
        return {
            text: {
                default: '',
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="tag"]',
                getAttrs: (node: HTMLElement | string) => {
                    if (typeof node === 'string') return null
                    return {
                        text: node.getAttribute('data-tag'),
                    }
                },
            },
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return [
            'span',
            mergeAttributes(
                {
                    'data-type': 'tag',
                    'data-tag': HTMLAttributes.text,
                },
                this.options.HTMLAttributes,
                HTMLAttributes
            )
        ]
    },

    addNodeView() {
        return ReactNodeViewRenderer(TagNodeView)
    },

    // ---- Markdown round-trip via @tiptap/markdown ----

    // @ts-ignore: @tiptap/markdown types are not fully extended on NodeConfig
    markdownToken: 'tag',

    // @ts-ignore
    markdownTokenizer: {
        name: 'tag',
        level: 'inline',
        start(src: string) {
            return src.indexOf('#')
        },
        tokenize(src: string) {
            // Match # followed by word characters, dashes, slashes, underscores.
            const match = src.match(/^#([a-zA-Z0-9_\/-]+)/)
            if (match) {
                return {
                    type: 'tag',
                    raw: match[0],
                    tagText: match[1],
                }
            }
            return undefined
        }
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'tag',
            attrs: {
                text: token.tagText,
            },
        }
    },
} as any)
