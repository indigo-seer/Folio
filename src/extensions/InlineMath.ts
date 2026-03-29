import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import InlineMathNodeView from '../components/InlineMathNodeView.tsx'

export const InlineMath = Node.create({
    name: 'inlineMath',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            math: { default: '' }
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="inline-math"]',
                getAttrs: (node: HTMLElement | string) => {
                    if (typeof node === 'string') return null
                    return { math: node.getAttribute('data-math') }
                }
            }
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(InlineMathNodeView)
    },

    // ---- Markdown mapping ----

    // @ts-ignore
    markdownToken: 'inlineMath',

    // @ts-ignore
    markdownTokenizer: {
        name: 'inlineMath',
        level: 'inline',
        start(src: string) { return src.indexOf('$') },
        tokenize(src: string) {
            // Match $math$ but exclusively fail if it's $$
            if (src.startsWith('$$')) return undefined

            const rule = /^\$([^\$\n]+)\$/
            const match = rule.exec(src)
            if (match) {
                return {
                    type: 'inlineMath',
                    raw: match[0],
                    math: match[1],
                }
            }
            return undefined
        }
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'inlineMath',
            attrs: { math: token.math },
        }
    },
} as any)
