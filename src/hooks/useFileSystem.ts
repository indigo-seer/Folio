import { useState, useCallback, useRef, useMemo } from 'react'
import { isTauri } from '../lib/config'
import { fs, sortTree, buildVaultIndex, extractWikilinks, VaultState, FileNode } from '../lib/fs'
import { invalidateCacheEntry, isAttachmentImagePath, setImageCacheVaultImagePaths, warmCacheForNote } from '../lib/imageCache'
import { IMAGE_EXTENSIONS, getBasename } from '../lib/constants'

function collectVaultImagePaths(tree: FileNode[]): string[] {
    const out: string[] = []
    const stack = [...tree]

    while (stack.length > 0) {
        const node = stack.pop()
        if (!node) continue

        if (node.kind === 'directory') {
            if (node.children?.length) stack.push(...node.children)
            continue
        }

        const extension = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : ''
        if (!IMAGE_EXTENSIONS.has(extension)) continue
        out.push(node.path)
    }

    return out
}

export function useFileSystem() {
    const [vault, setVault] = useState<VaultState>({
        rootPath: null,
        rootName: '',
        tree: [],
        notes: new Set(),
        backlinkIndex: new Map(),
    })

    const editorStates = useRef<Map<string, { scroll: number, cursor: number }>>(new Map())

    const refreshVault = useCallback(async (rootPath: string, metadata?: Partial<Pick<VaultState, 'rootPath' | 'rootName'>>) => {
        const tree = await fs.scanDirectory(rootPath)
        const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)
        setVault(prev => ({
            ...prev,
            ...metadata,
            tree: sortTree(tree),
            notes,
            backlinkIndex,
        }))
        const scannedImagePaths = fs.scanImageFiles
            ? await fs.scanImageFiles(rootPath)
            : []
        setImageCacheVaultImagePaths([
            ...collectVaultImagePaths(tree),
            ...scannedImagePaths,
        ])
    }, [])

    const loadVault = useCallback(async (path: string) => {
        try {
            const { path: rootPath, name: rootName } = await fs.loadVault(path)
            await refreshVault(rootPath, { rootPath, rootName })

            return { path: rootPath, name: rootName }
        } catch (err) {
            console.error('Failed to load vault deeply:', err)
            throw err
        }
    }, [refreshVault])

    const openVault = useCallback(async () => {
        try {
            const result = await fs.openVault()
            if (!result) return null

            const { path: rootPath, name: rootName } = result
            await refreshVault(rootPath, { rootPath, rootName })

            return { path: rootPath, name: rootName }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Failed to open vault:', err)
            }
            return null
        }
    }, [refreshVault])

    const readFile = useCallback(async (path: string): Promise<string> => {
        return fs.readFile(path)
    }, [])

    const readBinaryFile = useCallback(async (path: string): Promise<Uint8Array> => {
        if (!fs.readBinaryFile) throw new Error('Binary read not supported')
        return fs.readBinaryFile(path)
    }, [])

    const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
        await fs.writeFile(path, content)

        // Update backlink index incrementally
        setVault(prev => {
            const noteName = getBasename(path).replace(/\.md$/, '')
            if (!noteName) return prev
            const newIndex = new Map(prev.backlinkIndex)
            // Remove stale outgoing links from this note
            for (const [target, sources] of newIndex.entries()) {
                if (sources.has(noteName)) {
                    const newSources = new Set(sources)
                    newSources.delete(noteName)
                    newIndex.set(target, newSources) // ← was missing: write back the updated set
                }
            }
            // Add current outgoing links from this note
            for (const link of extractWikilinks(content)) {
                const sources = newIndex.get(link) || new Set()
                sources.add(noteName)
                newIndex.set(link, sources)
            }
            return { ...prev, backlinkIndex: newIndex }
        })
    }, [])

    const writeBinaryFile = useCallback(async (path: string, content: Uint8Array): Promise<void> => {
        if (!fs.writeBinaryFile) throw new Error('Binary write not supported')
        await fs.writeBinaryFile(path, content)

        if (isAttachmentImagePath(path)) {
            invalidateCacheEntry(path)
            void warmCacheForNote([path])
        }
    }, [])

    const ensureAttachmentFolder = useCallback(async (): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')
        // Try creating it using the standard adapter routing
        try {
            const { sep } = await import('@tauri-apps/api/path')
            const separator = await sep()
            const path = `${vault.rootPath}${separator}attachments`

            // Check if exists
            try {
                const { exists } = await import('@tauri-apps/plugin-fs')
                if (await exists(path)) return path
            } catch {
                // Ignore exist errors
            }

            await fs.createFolder(vault.rootPath, 'attachments')
            return path
        } catch (e) {
            console.warn('Silent skip: Attachment folder exists or creation failed', e)
            return vault.rootPath
        }
    }, [vault.rootPath])

    const createFile = useCallback(async (filename: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.createFile(vault.rootPath, filename, parentPath)
        await refreshVault(vault.rootPath)

        return newPath
    }, [vault.rootPath, refreshVault])

    const createFolder = useCallback(async (name: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.createFolder(vault.rootPath, name, parentPath)
        await refreshVault(vault.rootPath)

        return newPath
    }, [vault.rootPath, refreshVault])

    const renameFile = useCallback(async (oldPath: string, newName: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')
        const oldFilename = getBasename(oldPath)
        const isFile = oldFilename.endsWith('.md')

        const oldNoteName = oldFilename.replace(/\.md$/, '')
        const newNoteName = isFile && newName.endsWith('.md') ? newName.replace(/\.md$/, '') : newName

        const newPath = await fs.renameFile(oldPath, newName)
        if (isAttachmentImagePath(oldPath)) {
            invalidateCacheEntry(oldPath)
        }
        if (isAttachmentImagePath(newPath)) {
            void warmCacheForNote([newPath])
        }

        // Update backlinks in other files
        const sourcesToUpdate = vault.backlinkIndex.get(oldNoteName) || new Set<string>()
        if (sourcesToUpdate.size > 0) {
            const tree = await fs.scanDirectory(vault.rootPath)
            const { fileMap } = await buildVaultIndex(tree, fs.readFile)

            for (const sourceNoteName of sourcesToUpdate) {
                for (const [path, note] of fileMap.entries()) {
                    if (note === sourceNoteName) {
                        let content = await fs.readFile(path)
                        // Simple naive replace, escape RegExp not strictly needed for this pass
                        // since we moved the utility to indexer, but keeping logic consistent
                        //.replace(new RegExp(...) ...)
                        // Refined to string replaceAll for simplicity unless regex escape was ported
                        // To keep it clean, relying on basic replace logic for now or porting escapeRegExp back

                        const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                        content = content.replace(
                            new RegExp(`\\[\\[${escapeRegExp(oldNoteName)}\\]\\]`, 'g'),
                            `[[${newNoteName}]]`
                        )
                        await fs.writeFile(path, content)
                        break
                    }
                }
            }
        }

        await refreshVault(vault.rootPath)

        return newPath
    }, [vault.rootPath, vault.backlinkIndex, refreshVault])

    const moveFile = useCallback(async (oldPath: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.moveFile(vault.rootPath, oldPath, parentPath)
        if (isAttachmentImagePath(oldPath)) {
            invalidateCacheEntry(oldPath)
        }
        if (isAttachmentImagePath(newPath)) {
            void warmCacheForNote([newPath])
        }
        await refreshVault(vault.rootPath)
        return newPath
    }, [vault.rootPath, refreshVault])

    const deleteFile = useCallback(async (path: string): Promise<void> => {
        if (!vault.rootPath) throw new Error('No vault open')

        await fs.deleteFile(path)
        if (isAttachmentImagePath(path)) {
            invalidateCacheEntry(path)
        }
        await refreshVault(vault.rootPath)
    }, [vault.rootPath, refreshVault])

    const saveEditorState = useCallback((path: string, state: { scroll: number, cursor: number }) => {
        editorStates.current.set(path, state)
    }, [])

    const getEditorState = useCallback((path: string): { scroll: number, cursor: number } => {
        return editorStates.current.get(path) || { scroll: 0, cursor: 1 } // prose-mirror pos 1 is default
    }, [])

    const refreshTree = useCallback(async () => {
        if (!vault.rootPath) return
        await refreshVault(vault.rootPath)
    }, [vault.rootPath, refreshVault])

    return useMemo(() => ({
        vault,
        loadVault,
        openVault,
        readFile,
        readBinaryFile,
        writeFile,
        writeBinaryFile,
        ensureAttachmentFolder,
        createFile,
        createFolder,
        renameFile,
        moveFile,
        deleteFile,
        saveEditorState,
        getEditorState,
        refreshTree,
        isTauriEnv: isTauri(),
    }), [
        vault,
        loadVault,
        openVault,
        readFile,
        readBinaryFile,
        writeFile,
        writeBinaryFile,
        ensureAttachmentFolder,
        createFile,
        createFolder,
        renameFile,
        moveFile,
        deleteFile,
        saveEditorState,
        getEditorState,
        refreshTree,
    ])
}

/**
 * Type of the object returned by `useFileSystem`.
 * Use this instead of `any` at every consumer boundary.
 */
export type FileSystemAPI = ReturnType<typeof useFileSystem>
