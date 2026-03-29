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
        tokenize(src: string, tokens: any[] = []) {
            // Frontmatter is only valid as the very first top-level token.
            // Without this guard, any "--- ... ---" block in the middle of a
            // note (e.g. horizontal rule + table + horizontal rule) can be
            // incorrectly captured as YAML.
            if (tokens.length > 0) {
                return undefined
            }

            // Only match if at the very beginning of the document/block.
            // Format: --- \n content \n --- \n
            const rule = /^---\n([\s\S]*?)\n---(?:\n|$)/
            const match = rule.exec(src)
            if (match) {
                const yamlBody = match[1] || ''
                const yamlLines = yamlBody
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)

                // Avoid false positives where thematic breaks wrap non-YAML
                // content (for example tables between two horizontal rules).
                const looksLikeYaml = yamlLines.some(line => /^[A-Za-z0-9_-]+\s*:/.test(line))
                if (!looksLikeYaml) {
                    return undefined
                }

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
