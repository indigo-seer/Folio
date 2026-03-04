import { FileNode } from './types'

export function sortTree(nodes: FileNode[]): FileNode[] {
    return nodes
        .map(node => ({ ...node, children: node.children ? sortTree(node.children) : undefined }))
        .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
}

export function extractWikilinks(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g
    return Array.from(content.matchAll(regex)).map(m => m[1])
}

export async function buildVaultIndex(tree: FileNode[], readFileFn: (path: string) => Promise<string>) {
    const notes = new Set<string>()
    const backlinkIndex = new Map<string, Set<string>>()
    const fileMap = new Map<string, string>()

    function collectFiles(nodes: FileNode[]): FileNode[] {
        let files: FileNode[] = []
        for (const node of nodes) {
            if (node.kind === 'file') files.push(node)
            else if (node.children) files = files.concat(collectFiles(node.children))
        }
        return files
    }

    for (const file of collectFiles(tree)) {
        const noteName = file.name.replace(/\.md$/, '')
        notes.add(noteName)
        fileMap.set(file.path, noteName)
        try {
            const content = await readFileFn(file.path)
            for (const link of extractWikilinks(content)) {
                if (!backlinkIndex.has(link)) backlinkIndex.set(link, new Set())
                backlinkIndex.get(link)!.add(noteName)
            }
        } catch (err) {
            console.error(`Failed to index ${file.path}:`, err)
        }
    }

    return { notes, backlinkIndex, fileMap }
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
