import { Extension } from '@tiptap/core'

const IMAGE_EXTENSIONS = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tiff', 'tif'
]

function isImagePath(target: string): boolean {
    const clean = target.split('#')[0].split('?')[0].toLowerCase()
    const dot = clean.lastIndexOf('.')
    if (dot === -1) return false
    const ext = clean.slice(dot + 1)
    return IMAGE_EXTENSIONS.includes(ext)
}

function parseSizePart(sizePart: string | undefined): { width: number | null; height: number | null } {
    if (!sizePart) return { width: null, height: null }
    const trimmed = sizePart.trim()
    if (!trimmed) return { width: null, height: null }

    const both = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i)
    if (both) {
        return { width: Number(both[1]), height: Number(both[2]) }
    }

    const onlyWidth = trimmed.match(/^(\d+)$/)
    if (onlyWidth) {
        return { width: Number(onlyWidth[1]), height: null }
    }

    return { width: null, height: null }
}

function defaultAltFromPath(src: string): string {
    const last = src.split(/[\\/]/).pop() || src
    return last.replace(/\.[^.]+$/, '')
}

export const ObsidianImage = Extension.create({
    name: 'obsidianImage',

    // @ts-ignore
    markdownToken: 'obsidianImage',

    // @ts-ignore
    markdownTokenizer: {
        name: 'obsidianImage',
        level: 'inline',
        start(src: string) {
            return src.indexOf('![[')
        },
        tokenize(src: string) {
            const match = /^!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/.exec(src)
            if (!match) return undefined

            const imagePath = (match[1] || '').trim()
            if (!isImagePath(imagePath)) return undefined

            const { width, height } = parseSizePart(match[2])

            return {
                type: 'obsidianImage',
                raw: match[0],
                src: imagePath,
                width,
                height,
                alt: defaultAltFromPath(imagePath),
            }
        },
    },

    // @ts-ignore
    parseMarkdown(token: any) {
        return {
            type: 'image',
            attrs: {
                src: token.src,
                alt: token.alt || '',
                width: token.width ?? null,
                height: token.height ?? null,
                obsidian: true,
            },
        }
    },
} as any)
