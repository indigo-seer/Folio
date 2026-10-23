import { describe, it, expect } from 'vitest'
import { MarkdownManager } from '@tiptap/markdown'
import { getEditorExtensions } from '../editor/extensions'
import { repairUnparsedMathInTipTapJson, tipTapToMarkdown } from '../markdown'

function parseMarkdown(markdown: string) {
    const extensions = getEditorExtensions({ current: new Set<string>() })
    return new MarkdownManager({ extensions }).parse(markdown)
}

describe('@tiptap/markdown parsing', () => {

    it('parses Callouts from markdown', () => {
        const json = parseMarkdown('> [!info]- Fun Fact\n> Water is wet.')
        expect(json.content?.find(n => n.type === 'callout')).toBeDefined()
    })

    it('parses Embeds from markdown', () => {
        const json = parseMarkdown('![[Some Note]]')
        expect(json.content?.some(n => n.type === 'embed' || (n.content && n.content.some(c => c.type === 'embed')))).toBeTruthy()
    })

    it('parses Obsidian image wikilinks as image nodes (not embeds)', () => {
        const json = parseMarkdown('![[image.png|300x200]]')
        const firstTopLevel = json.content?.[0]
        const firstInline = firstTopLevel?.content?.[0]

        expect(firstInline?.type).toBe('image')
        expect((firstInline as any)?.attrs?.src).toBe('image.png')
        expect((firstInline as any)?.attrs?.width).toBe(300)
        expect((firstInline as any)?.attrs?.height).toBe(200)
        expect(json.content?.some(n => n.type === 'embed' || (n.content && n.content.some(c => c.type === 'embed')))).toBe(false)
    })

    it('parses MathBlocks from markdown', () => {
        const json = parseMarkdown('$$\na^2 + b^2 = c^2\n$$')
        expect(json.content?.some(n => n.type === 'mathBlock')).toBeTruthy()
    })

    it('parses single-line display math used by Obsidian', () => {
        const json = parseMarkdown('$$\\begin{bmatrix} 1 & 2 \\ 3 & 4 \\end{bmatrix}$$')
        const math = json.content?.find(n => n.type === 'mathBlock')

        expect(math).toBeDefined()
        expect((math as any)?.attrs?.latex).toContain('begin{bmatrix}')
    })

    it('parses display math with the opening formula and closing delimiter on separate lines', () => {
        const json = parseMarkdown([
            '$$\\begin{bmatrix} 10 & 20 & 30 \\ 40 & 50 & 60 \\end{bmatrix}\\',
            '',
            '$$',
        ].join('\n'))
        const math = json.content?.find(n => n.type === 'mathBlock')

        expect(math).toBeDefined()
        expect((math as any)?.attrs?.latex).toContain('begin{bmatrix}')
    })

    it('does not parse mid-document horizontal-rule pairs as frontmatter', () => {
        const markdown = [
            '- This list',
            '',
            '> [!note] Note',
            '> Testing to see if this callout becomes weird',
            '',
            '---',
            '',
            '| Entry 1 | Entry 2 |',
            '| --- | --- |',
            '| A | B |',
            '| C | D |',
            '',
            '---',
        ].join('\n')

        const json = parseMarkdown(markdown)
        const topLevel = json.content || []

        expect(topLevel.some(n => n.type === 'frontmatter')).toBe(false)
        expect(topLevel.some(n => n.type === 'table')).toBe(true)
        expect(topLevel.filter(n => n.type === 'horizontalRule').length).toBeGreaterThanOrEqual(2)
        expect(topLevel.some(n => n.type === 'callout')).toBe(true)
    })
})

describe('production Markdown preservation', () => {
    function roundTrip(source: string) {
        return tipTapToMarkdown(repairUnparsedMathInTipTapJson(parseMarkdown(source) as any))
    }

    for (const [label, source] of [
        ['inline math', 'The answer is $x+1$.'],
        ['inline code containing dollars', '`$HOME and $PATH`'],
        ['escaped literal emphasis', '\\*literal\\*'],
        ['ordered list start', '7. seven\n8. eight'],
        ['code span containing backticks', '``a`b``'],
        ['code fence containing backticks', '````md\n```\n````'],
        ['table pipe', '| A | B |\n| --- | --- |\n| a\\|b | c |'],
        ['table alignment', '| A | B |\n| :--- | ---: |\n| a | b |'],
    ] as const) {
        it(`round-trips ${label}`, () => {
            expect(roundTrip(source).trim()).toBe(source.trim())
        })
    }
})
