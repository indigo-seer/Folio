import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MathBlockNodeView from '../components/MathBlockNodeView'

export const MathBlock = Node.create({
    name: 'mathBlock',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            latex: { default: '' },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="math-block"]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' }), 0]
    },

    addNodeView() {
        return ReactNodeViewRenderer(MathBlockNodeView)
    },

    // ---- Markdown mapping ----

    // @ts-ignore
    markdownToken: 'mathBlock',

    // @ts-ignore
    markdownTokenizer: {
        name: 'mathBlock',
        level: 'block',
        start(src: string) {
            return src.indexOf('$$')
        },
        tokenize(src: string) {
            // Support Obsidian's delimiter layouts:
            //   $$\n formula\n $$
            //   $$formula$$
            //   $$formula\n $$
            const rule = /^\$\$[ \t]*(?:\r?\n)?([\s\S]*?)(?:\r?\n)?\$\$[ \t]*(?:\r?\n|$)/
            const match = rule.exec(src)
            if (match) {
                return {
                    type: 'mathBlock',
                    raw: match[0],
                    text: match[1] || '',
                }
            }
            return undefined
        }
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'mathBlock',
            attrs: { latex: token.text || '' },
        }
    },
} as any)
