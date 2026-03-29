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
})
