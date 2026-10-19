import { describe, it, expect } from 'vitest'
import {
    extractReferenceStyleDefinitions,
    markdownToTipTap,
    repairUnparsedMathInTipTapJson,
    restoreReferenceStyleLinks,
    tipTapToMarkdown,
} from '../markdown'

describe('math compatibility repair', () => {
    it('converts literal inline math left by the Markdown parser', () => {
        const repaired = repairUnparsedMathInTipTapJson({
            type: 'doc',
            content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: 'Sum from $1$ to $n$.' }],
            }],
        })

        expect(repaired.content?.[0].content).toEqual([
            { type: 'text', text: 'Sum from ' },
            { type: 'inlineMath', attrs: { math: '1' } },
            { type: 'text', text: ' to ' },
            { type: 'inlineMath', attrs: { math: 'n' } },
            { type: 'text', text: '.' },
        ])
    })

    it('converts a literal display-math paragraph into a math block', () => {
        const repaired = repairUnparsedMathInTipTapJson({
            type: 'doc',
            content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: '$$\\text{Sum} = \\frac{n(n+1)}{2}$$' }],
            }],
        })

        expect(repaired.content?.[0]).toEqual({
            type: 'mathBlock',
            attrs: { latex: '\\text{Sum} = \\frac{n(n+1)}{2}' },
        })
    })
})

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
                    attrs: { latex: 'a^2 + b^2 = c^2' },
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

    it('serializes Obsidian-style image wikilinks with size', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'image',
                            attrs: {
                                src: 'attachments/image.png',
                                obsidian: true,
                                width: 300,
                                height: 200,
                            }
                        }
                    ]
                }
            ]
        }

        const md = tipTapToMarkdown(doc as any)
        expect(md).toBe('![[attachments/image.png|300x200]]')
    })

    it('parses Obsidian image wikilink without size', () => {
        const doc = markdownToTipTap('![[image.png]]')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('image')
        expect(firstInline?.attrs?.src).toBe('image.png')
        expect(firstInline?.attrs?.width).toBeNull()
        expect(firstInline?.attrs?.height).toBeNull()
        expect(firstInline?.attrs?.obsidian).toBe(true)
    })

    it('parses Obsidian image wikilink with width', () => {
        const doc = markdownToTipTap('![[image.png|300]]')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('image')
        expect(firstInline?.attrs?.src).toBe('image.png')
        expect(firstInline?.attrs?.width).toBe(300)
        expect(firstInline?.attrs?.height).toBeNull()
        expect(firstInline?.attrs?.obsidian).toBe(true)
    })

    it('parses Obsidian image wikilink with width and height', () => {
        const doc = markdownToTipTap('![[image.png|300x200]]')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('image')
        expect(firstInline?.attrs?.src).toBe('image.png')
        expect(firstInline?.attrs?.width).toBe(300)
        expect(firstInline?.attrs?.height).toBe(200)
        expect(firstInline?.attrs?.obsidian).toBe(true)
    })

    it('parses standard markdown image syntax', () => {
        const doc = markdownToTipTap('![alt text](image.png)')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('image')
        expect(firstInline?.attrs?.src).toBe('image.png')
        expect(firstInline?.attrs?.alt).toBe('alt text')
        expect(firstInline?.attrs?.obsidian).toBeUndefined()
    })

    it('parses markdown image syntax with nested attachment path', () => {
        const doc = markdownToTipTap('![alt text](attachments/image.png)')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('image')
        expect(firstInline?.attrs?.src).toBe('attachments/image.png')
        expect(firstInline?.attrs?.alt).toBe('alt text')
        expect(firstInline?.attrs?.obsidian).toBeUndefined()
    })

    it('parses non-image wikilink embeds in fallback parser', () => {
        const doc = markdownToTipTap('![[Some Note#Heading]]')
        const firstInline = doc.content?.[0]?.content?.[0] as any

        expect(firstInline?.type).toBe('embed')
        expect(firstInline?.attrs?.noteName).toBe('Some Note')
        expect(firstInline?.attrs?.anchor).toBe('#Heading')
    })

})

describe('Image Markdown Round-Trip', () => {
    function roundTrip(markdown: string): string {
        return tipTapToMarkdown(markdownToTipTap(markdown) as any)
    }

    it('round-trips standard image without width', () => {
        const input = '![alt](attachments/photo.png)'
        expect(roundTrip(input)).toBe(input)
    })

    it('round-trips standard html image with width', () => {
        const input = '<img src="attachments/photo.png" alt="alt" width="640" />'
        expect(roundTrip(input)).toBe(input)
    })

    it('round-trips Obsidian image without width', () => {
        const input = '![[image.png]]'
        expect(roundTrip(input)).toBe(input)
    })

    it('round-trips Obsidian image with width', () => {
        const input = '![[image.png|640]]'
        expect(roundTrip(input)).toBe(input)
    })

    it('round-trips Obsidian image with width and height', () => {
        const input = '![[image.png|640x480]]'
        expect(roundTrip(input)).toBe(input)
    })

    it('omits width attribute when width is 0 or undefined', () => {
        const widthZero = '<img src="attachments/photo.png" alt="alt" width="0" />'
        const parsedWidthZero = roundTrip(widthZero)
        expect(parsedWidthZero).toBe('![alt](attachments/photo.png)')
        expect(parsedWidthZero.includes('width="0"')).toBe(false)

        const docWithUndefinedWidth = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'image',
                            attrs: {
                                src: 'attachments/photo.png',
                                alt: 'alt',
                                width: undefined,
                            },
                        },
                    ],
                },
            ],
        }

        const serialized = tipTapToMarkdown(docWithUndefinedWidth as any)
        expect(serialized).toBe('![alt](attachments/photo.png)')
        expect(serialized.includes('width=')).toBe(false)
    })
})

describe('Reference Link Restoration', () => {
    it('restores inline links to reference-style links when definitions exist', () => {
        const source = [
            'Example [OpenAI][oa].',
            '',
            '[oa]: https://openai.com "OpenAI"',
        ].join('\n')

        const definitions = extractReferenceStyleDefinitions(source)
        const converted = restoreReferenceStyleLinks(
            'Example [OpenAI](https://openai.com "OpenAI").',
            definitions,
        )

        expect(converted).toBe(source)
    })
})
