import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import FrontmatterNodeView from '../components/FrontmatterNodeView.tsx'

export const Frontmatter = Node.create({
    name: 'frontmatter',
    group: 'block',
    atom: true, // Non-editable text body from standard tiptap commands
    defining: true,

    addAttributes() {
        return {
            yaml: {
                default: '',
            },
            expanded: {
                default: false,
            }
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="frontmatter"]',
                getAttrs: (node: HTMLElement | string) => {
                    if (typeof node === 'string') return null
                    return {
                        yaml: node.getAttribute('data-yaml'),
                        expanded: node.hasAttribute('data-expanded'),
                    }
                },
            },
        ]
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'frontmatter' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(FrontmatterNodeView)
    },

    // ---- Markdown mapping ----

    // @ts-ignore
    markdownToken: 'frontmatter',

    // @ts-ignore
    markdownTokenizer: {
        name: 'frontmatter',
        level: 'block',
        start(src: string) {
            return src.indexOf('---') === 0 ? 0 : -1
        },
        tokenize(src: string) {
            // Only match if at the very beginning of the document/block.
            // Format: --- \n content \n --- \n
            const rule = /^---\n([\s\S]*?)\n---(?:\n|$)/
            const match = rule.exec(src)
            if (match) {
                return {
                    type: 'frontmatter',
                    raw: match[0],
                    yaml: match[1],
                }
            }
            return undefined
        }
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'frontmatter',
            attrs: {
                yaml: token.yaml,
            },
        }
    },
} as any)
