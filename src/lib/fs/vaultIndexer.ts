import { FileNode } from './types'
import { IMAGE_EXTENSIONS } from '../constants'

function isImageEmbedTarget(input: string): boolean {
    const target = input.split('|', 1)[0].split(/[#^]/, 1)[0].trim()
    const extension = target.includes('.') ? target.split('.').pop()!.toLowerCase() : ''
    return IMAGE_EXTENSIONS.has(extension)
}

export function sortTree(nodes: FileNode[]): FileNode[] {
    return nodes
        .map(node => ({ ...node, children: node.children ? sortTree(node.children) : undefined }))
        .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
}

export function extractWikilinks(content: string): string[] {
    const withoutCode = content
        .replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, '')
        .replace(/(`+)([^\n]*?)\1/g, '')
    const regex = /(!?)\[\[([^\]]+)\]\]/g
    return Array.from(withoutCode.matchAll(regex))
        .filter(match => !match[1] || !isImageEmbedTarget(match[2]))
        .map(match => normalizeNoteTarget(match[2]))
        .filter((target): target is string => Boolean(target))
}

export function rewriteWikilinkTargets(content: string, oldTarget: string, newTarget: string): string {
    const normalizedOld = normalizeNoteTarget(oldTarget).toLowerCase()
    if (!normalizedOld) return content
    const protectedSegments: string[] = []
    const protect = (segment: string) => {
        const token = `\uE000FOLIUM_LINK_CODE_${protectedSegments.length}\uE001`
        protectedSegments.push(segment)
        return token
    }
    const protectedContent = content
        .replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, protect)
        .replace(/(`+)([^\n]*?)\1/g, protect)
    const rewritten = protectedContent.replace(/(!?)\[\[([^\]]+)\]\]/g, (full, embedPrefix: string, inner: string) => {
        if (embedPrefix && isImageEmbedTarget(inner)) return full
        const aliasIndex = inner.indexOf('|')
        const beforeAlias = aliasIndex >= 0 ? inner.slice(0, aliasIndex) : inner
        const alias = aliasIndex >= 0 ? inner.slice(aliasIndex) : ''
        const anchorIndex = beforeAlias.search(/[#^]/)
        const target = anchorIndex >= 0 ? beforeAlias.slice(0, anchorIndex) : beforeAlias
        const anchor = anchorIndex >= 0 ? beforeAlias.slice(anchorIndex) : ''
        if (normalizeNoteTarget(target).toLowerCase() !== normalizedOld) return full
        return `${embedPrefix}[[${newTarget}${anchor}${alias}]]`
    })
    return rewritten.replace(/\uE000FOLIUM_LINK_CODE_(\d+)\uE001/g, (_match, index) => protectedSegments[Number(index)] || '')
}

export function normalizeNoteTarget(input: string): string {
    const withoutAlias = input.split('|', 1)[0].trim()
    const withoutAnchor = withoutAlias.split(/[#^]/, 1)[0].trim()
    return withoutAnchor
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\.md$/i, '')
        .replace(/^\/+|\/+$/g, '')
}

export function findNotePath(tree: FileNode[], input: string): string | null {
    const target = normalizeNoteTarget(input).toLowerCase()
    if (!target) return null
    const matches: { path: string; relativeTarget: string; basename: string }[] = []

    function collect(nodes: FileNode[], parent: string[] = []) {
        for (const node of nodes) {
            if (node.kind === 'directory') {
                collect(node.children || [], [...parent, node.name])
                continue
            }
            const basename = node.name.replace(/\.md$/i, '')
            matches.push({
                path: node.path,
                basename: basename.toLowerCase(),
                relativeTarget: [...parent, basename].join('/').toLowerCase(),
            })
        }
    }
    collect(tree)

    const exact = matches.find(match => match.relativeTarget === target)
    if (exact) return exact.path
    const basenameMatches = matches.filter(match => match.basename === target)
    return basenameMatches.length === 1 ? basenameMatches[0].path : null
}

export function getNoteTargetForPath(tree: FileNode[], path: string): string | null {
    const files: Array<{ path: string; basename: string; relativeTarget: string }> = []
    function collect(nodes: FileNode[], parent: string[] = []) {
        for (const node of nodes) {
            if (node.kind === 'directory') {
                collect(node.children || [], [...parent, node.name])
                continue
            }
            const basename = node.name.replace(/\.md$/i, '')
            files.push({ path: node.path, basename, relativeTarget: [...parent, basename].join('/') })
        }
    }
    collect(tree)
    const match = files.find(file => file.path === path)
    if (!match) return null
    const duplicateCount = files.filter(file => file.basename.toLowerCase() === match.basename.toLowerCase()).length
    return duplicateCount === 1 ? match.basename : match.relativeTarget
}

export async function buildVaultIndex(tree: FileNode[], readFileFn: (path: string) => Promise<string>) {
    const notes = new Set<string>()
    const backlinkIndex = new Map<string, Set<string>>()
    const fileMap = new Map<string, string>()

    function collectFiles(nodes: FileNode[], parent: string[] = []): Array<{ file: FileNode; relativeTarget: string }> {
        let files: Array<{ file: FileNode; relativeTarget: string }> = []
        for (const node of nodes) {
            if (node.kind === 'file') {
                files.push({ file: node, relativeTarget: [...parent, node.name.replace(/\.md$/i, '')].join('/') })
            } else if (node.children) {
                files = files.concat(collectFiles(node.children, [...parent, node.name]))
            }
        }
        return files
    }

    const files = collectFiles(tree)
    const basenameCounts = new Map<string, number>()
    for (const { file } of files) {
        const basename = file.name.replace(/\.md$/i, '').toLowerCase()
        basenameCounts.set(basename, (basenameCounts.get(basename) || 0) + 1)
    }

    const indexedFiles = files.map(({ file, relativeTarget }) => {
        const basename = file.name.replace(/\.md$/i, '')
        const noteTarget = basenameCounts.get(basename.toLowerCase()) === 1 ? basename : relativeTarget
        notes.add(noteTarget)
        fileMap.set(file.path, noteTarget)
        return { file, noteTarget }
    })

    const concurrency = 8
    for (let offset = 0; offset < indexedFiles.length; offset += concurrency) {
        await Promise.all(indexedFiles.slice(offset, offset + concurrency).map(async ({ file, noteTarget }) => {
            try {
                const content = await readFileFn(file.path)
                for (const link of extractWikilinks(content)) {
                    if (!backlinkIndex.has(link)) backlinkIndex.set(link, new Set())
                    backlinkIndex.get(link)!.add(noteTarget)
                }
            } catch (err) {
                console.error(`Failed to index ${file.path}:`, err)
            }
        }))
    }

    return { notes, backlinkIndex, fileMap }
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
