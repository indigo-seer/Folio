import { describe, expect, it } from 'vitest'
import { ObsidianImage } from '../ObsidianImage'
import { Embed } from '../Embed'

function obsidianTokenize(input: string) {
    return (ObsidianImage as any)?.config?.markdownTokenizer?.tokenize?.(input)
}

function embedTokenize(input: string) {
    return (Embed as any)?.config?.markdownTokenizer?.tokenize?.(input)
}

describe('Obsidian image tokenizer boundaries', () => {
    it('parses ![[image.png]] as image', () => {
        const token = obsidianTokenize('![[image.png]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.png')
        expect(token?.width).toBeNull()
        expect(token?.height).toBeNull()
        expect(embedTokenize('![[image.png]]')).toBeUndefined()
    })

    it('parses ![[image.png|300]] as image width only', () => {
        const token = obsidianTokenize('![[image.png|300]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.png')
        expect(token?.width).toBe(300)
        expect(token?.height).toBeNull()
        expect(embedTokenize('![[image.png|300]]')).toBeUndefined()
    })

    it('parses ![[image.png|300x200]] as image width+height', () => {
        const token = obsidianTokenize('![[image.png|300x200]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.png')
        expect(token?.width).toBe(300)
        expect(token?.height).toBe(200)
        expect(embedTokenize('![[image.png|300x200]]')).toBeUndefined()
    })

    it('accepts non-numeric pipe as non-size metadata', () => {
        const token = obsidianTokenize('![[image.png|caption text]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.png')
        expect(token?.width).toBeNull()
        expect(token?.height).toBeNull()
        expect(embedTokenize('![[image.png|caption text]]')).toBeUndefined()
    })

    it('preserves fragment in src for ![[image.svg#section]]', () => {
        const token = obsidianTokenize('![[image.svg#section]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.svg#section')
        expect(token?.width).toBeNull()
        expect(token?.height).toBeNull()
        expect(embedTokenize('![[image.svg#section]]')).toBeUndefined()
    })

    it('parses fragment+size together for ![[image.png#section|300]]', () => {
        const token = obsidianTokenize('![[image.png#section|300]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('image.png#section')
        expect(token?.width).toBe(300)
        expect(token?.height).toBeNull()
        expect(embedTokenize('![[image.png#section|300]]')).toBeUndefined()
    })

    it('matches uppercase extensions case-insensitively', () => {
        const token = obsidianTokenize('![[IMAGE.PNG]]')
        expect(token?.type).toBe('obsidianImage')
        expect(token?.src).toBe('IMAGE.PNG')
        expect(embedTokenize('![[IMAGE.PNG]]')).toBeUndefined()
    })

    it('does not match extensionless ![[image]] and falls through to Embed', () => {
        expect(obsidianTokenize('![[image]]')).toBeUndefined()

        const embed = embedTokenize('![[image]]')
        expect(embed?.type).toBe('embed')
        expect(embed?.embedNoteName).toBe('image')
    })

    it('does not match non-image extension ![[note.md]] and falls through to Embed', () => {
        expect(obsidianTokenize('![[note.md]]')).toBeUndefined()

        const embed = embedTokenize('![[note.md]]')
        expect(embed?.type).toBe('embed')
        expect(embed?.embedNoteName).toBe('note.md')
    })
})
