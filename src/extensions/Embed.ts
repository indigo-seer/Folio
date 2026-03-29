import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import EmbedNodeView from '../components/EmbedNodeView.tsx'

/**
 * Parses `![[noteName#anchor]]` embeds.
 * Note transclusion (displaying actual note contents) will be handled in Phase 5.
 */
export const Embed = Node.create({
    name: 'embed',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            noteName: { default: null },
            anchor: { default: null },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="embed"]',
                getAttrs: (node: HTMLElement | string) => {
                    if (typeof node === 'string') return null
                    return {
                        noteName: node.getAttribute('data-note-name'),
                        anchor: node.getAttribute('data-anchor'),
                    }
                },
            },
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embed' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(EmbedNodeView)
    },

    // ---- Markdown mapping ----

    // @ts-ignore
    markdownToken: 'embed',

    // @ts-ignore
    markdownTokenizer: {
        name: 'embed',
        level: 'inline',
        start(src: string) {
            return src.indexOf('![[')
        },
        tokenize(src: string) {
            // Match ![[noteName]] or ![[noteName#anchor]]
            const rule = /^!\[\[([^\]]+)\]\]/
            const match = rule.exec(src)
            if (match) {
                const inner = match[1]
                let noteName = inner
                let anchor = ''

                const hashIdx = inner.indexOf('#')
                const caretIdx = inner.indexOf('^')
                const splitIdx = hashIdx !== -1 ? hashIdx : caretIdx

                if (splitIdx !== -1) {
                    noteName = inner.slice(0, splitIdx)
                    anchor = inner.slice(splitIdx)
                }

                return {
                    type: 'embed',
                    raw: match[0],
                    embedNoteName: noteName,
                    embedAnchor: anchor || null,
                }
            }
            return undefined
        }
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'embed',
            attrs: {
                noteName: token.embedNoteName,
                anchor: token.embedAnchor,
            },
        }
    },
} as any)
