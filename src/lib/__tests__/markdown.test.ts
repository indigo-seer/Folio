import { describe, it, expect } from 'vitest'
import { tipTapToMarkdown } from '../markdown'

describe('tipTapToMarkdown Custom Extensions Serialization', () => {

    it('serializes pure Highlight marks', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'This represents a ' },
                        { type: 'text', marks: [{ type: 'highlight' }], text: 'very important' },
                        { type: 'text', text: ' detail.' }
                    ]
                }
            ]
        }

        const md = tipTapToMarkdown(doc as any)
        expect(md).toBe('This represents a ==very important== detail.')
    })

    it('serializes Tag nodes', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'See the ' },
                        { type: 'tag', attrs: { text: 'reference/docs' } },
                        { type: 'text', text: ' for more info.' }
                    ]
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md).toBe('See the #reference/docs for more info.')
    })

    it('serializes Callout blocks', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'callout',
                    attrs: { type: 'info', title: 'Fun Fact', foldable: true, defaultExpanded: false },
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Water is wet.' }]
                        }
                    ]
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md.trim()).toBe('> [!info]- Fun Fact\n> Water is wet.')
    })

    it('serializes Frontmatter blocks', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'frontmatter',
                    attrs: { yaml: 'tags: [a, b]\nalias: c' }
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Document start.' }]
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md).toBe('---\ntags: [a, b]\nalias: c\n---\n\nDocument start.')
    })

    it('serializes Embed targets', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Here is transcluded note:' }]
                },
                {
                    type: 'embed',
                    attrs: { noteName: 'Other Note', anchor: '#Heading' }
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md.trim()).toBe('Here is transcluded note:\n\n![[Other Note#Heading]]')
    })

    it('serializes MathBlocks', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'mathBlock',
                    content: [{ type: 'text', text: 'a^2 + b^2 = c^2' }]
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md.trim()).toBe('$$\na^2 + b^2 = c^2\n$$')
    })

    it('serializes complex native Tables', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                {
                                    type: 'tableHeader',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [{ type: 'text', text: 'Header A' }]
                                        }
                                    ]
                                },
                                {
                                    type: 'tableHeader',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [{ type: 'text', text: 'Header B' }]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            type: 'tableRow',
                            content: [
                                {
                                    type: 'tableCell',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [{ type: 'text', text: '1' }]
                                        }
                                    ]
                                },
                                {
                                    type: 'tableCell',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [{ type: 'text', text: '2' }]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        const md = tipTapToMarkdown(doc as any)
        expect(md.trim()).toBe('| Header A | Header B |\n| --- | --- |\n| 1 | 2 |')
    })

})
