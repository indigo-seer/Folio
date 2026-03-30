import { describe, it, expect } from 'vitest'
import { getEditorExtensions } from '../editor/extensions'
import { Editor } from '@tiptap/core'

describe('markdownToTipTap AST Parsing', () => {

    it('parses Callouts from markdown', () => {
        const dummyRef = { current: new Set<string>() }
        const extensions = getEditorExtensions(dummyRef)

        const editor = new Editor({
            extensions,
            content: '> [!info]- Fun Fact\n> Water is wet.'
        })

        const json = editor.getJSON()
        console.log(JSON.stringify(json, null, 2))
        expect(json.content?.find(n => n.type === 'callout')).toBeDefined()
    })

    it('parses Embeds from markdown', () => {
        const dummyRef = { current: new Set<string>() }
        const extensions = getEditorExtensions(dummyRef)

        const editor = new Editor({
            extensions,
            content: '![[Some Note]]'
        })

        const json = editor.getJSON()
        console.log("Embed Output:", JSON.stringify(json.content, null, 2))
        expect(json.content?.some(n => n.type === 'embed' || (n.content && n.content.some(c => c.type === 'embed')))).toBeTruthy()
    })

    it('parses Obsidian image wikilinks as image nodes (not embeds)', () => {
        const dummyRef = { current: new Set<string>() }
        const extensions = getEditorExtensions(dummyRef)

        const editor = new Editor({
            extensions,
            content: '![[image.png|300x200]]'
        })

        const json = editor.getJSON()
        const firstTopLevel = json.content?.[0]
        const firstInline = firstTopLevel?.content?.[0]

        expect(firstInline?.type).toBe('image')
        expect((firstInline as any)?.attrs?.src).toBe('image.png')
        expect((firstInline as any)?.attrs?.width).toBe(300)
        expect((firstInline as any)?.attrs?.height).toBe(200)
        expect(json.content?.some(n => n.type === 'embed' || (n.content && n.content.some(c => c.type === 'embed')))).toBe(false)
    })

    it('parses MathBlocks from markdown', () => {
        const dummyRef = { current: new Set<string>() }
        const extensions = getEditorExtensions(dummyRef)

        const editor = new Editor({
            extensions,
            content: '$$\na^2 + b^2 = c^2\n$$'
        })

        const json = editor.getJSON()
        console.log("Math Output:", JSON.stringify(json.content, null, 2))
        expect(json.content?.some(n => n.type === 'mathBlock')).toBeTruthy()
    })

    it('does not parse mid-document horizontal-rule pairs as frontmatter', () => {
        const dummyRef = { current: new Set<string>() }
        const extensions = getEditorExtensions(dummyRef)

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

        const editor = new Editor({
            extensions,
            content: markdown
        })

        const json = editor.getJSON()
        const topLevel = json.content || []

        expect(topLevel.some(n => n.type === 'frontmatter')).toBe(false)
        expect(topLevel.some(n => n.type === 'table')).toBe(true)
        expect(topLevel.filter(n => n.type === 'horizontalRule').length).toBeGreaterThanOrEqual(2)
        expect(topLevel.some(n => n.type === 'callout')).toBe(true)
    })
})
