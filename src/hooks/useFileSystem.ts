import { useState, useCallback, useRef, useMemo } from 'react'
import { isTauri } from '../lib/config'
import { fs, sortTree, buildVaultIndex, extractWikilinks, VaultState } from '../lib/fs'

export function useFileSystem() {
    const [vault, setVault] = useState<VaultState>({
        rootPath: null,
        rootName: '',
        tree: [],
        notes: new Set(),
        backlinkIndex: new Map(),
    })

    const editorStates = useRef<Map<string, { scroll: number, cursor: number }>>(new Map())

    const loadVault = useCallback(async (path: string) => {
        try {
            const { path: rootPath, name: rootName } = await fs.loadVault(path)
            const tree = await fs.scanDirectory(rootPath)
            const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)

            setVault({
                rootPath,
                rootName,
                tree: sortTree(tree),
                notes,
                backlinkIndex,
            })

            return { path: rootPath, name: rootName }
        } catch (err) {
            console.error('Failed to load vault deeply:', err)
            throw err
        }
    }, [])

    const openVault = useCallback(async () => {
        try {
            const result = await fs.openVault()
            if (!result) return null

            const { path: rootPath, name: rootName } = result
            const tree = await fs.scanDirectory(rootPath)
            const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)

            setVault({
                rootPath,
                rootName,
                tree: sortTree(tree),
                notes,
                backlinkIndex
            })

            return { path: rootPath, name: rootName }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Failed to open vault:', err)
            }
            return null
        }
    }, [])

    const readFile = useCallback(async (path: string): Promise<string> => {
        return fs.readFile(path)
    }, [])

    const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
        await fs.writeFile(path, content)

        // Update backlink index incrementally
        setVault(prev => {
            const noteName = path.split(/[\/\\]/).pop()?.replace(/\.md$/, '')
            if (!noteName) return prev
            const newIndex = new Map(prev.backlinkIndex)
            for (const [, sources] of newIndex.entries()) {
                if (sources.has(noteName)) {
                    const newSources = new Set(sources)
                    newSources.delete(noteName)
                }
            }
            for (const link of extractWikilinks(content)) {
                const sources = newIndex.get(link) || new Set()
                sources.add(noteName)
                newIndex.set(link, sources)
            }
            return { ...prev, backlinkIndex: newIndex }
        })
    }, [])

    const createFile = useCallback(async (filename: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.createFile(vault.rootPath, filename, parentPath)
        const tree = await fs.scanDirectory(vault.rootPath)

        const noteName = filename.endsWith('.md') ? filename.replace(/\.md$/, '') : filename
        setVault(prev => {
            const newNotes = new Set(prev.notes)
            newNotes.add(noteName)
            return { ...prev, tree: sortTree(tree), notes: newNotes }
        })

        return newPath
    }, [vault.rootPath])

    const createFolder = useCallback(async (name: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.createFolder(vault.rootPath, name, parentPath)
        const tree = await fs.scanDirectory(vault.rootPath)

        setVault(prev => ({ ...prev, tree: sortTree(tree) }))

        return newPath
    }, [vault.rootPath])

    const renameFile = useCallback(async (oldPath: string, newName: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')
        const oldFilename = oldPath.split(/[\/\\]/).pop()!
        const isFile = oldFilename.endsWith('.md')

        const oldNoteName = oldFilename.replace(/\.md$/, '')
        const newNoteName = isFile && newName.endsWith('.md') ? newName.replace(/\.md$/, '') : newName

        const newPath = await fs.renameFile(oldPath, newName)

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

        const freshTree = await fs.scanDirectory(vault.rootPath)
        const { notes, backlinkIndex } = await buildVaultIndex(freshTree, fs.readFile)

        setVault(prev => ({
            ...prev,
            tree: sortTree(freshTree),
            notes,
            backlinkIndex,
        }))

        return newPath
    }, [vault.rootPath, vault.backlinkIndex])

    const moveFile = useCallback(async (oldPath: string, parentPath?: string): Promise<string> => {
        if (!vault.rootPath) throw new Error('No vault open')

        const newPath = await fs.moveFile(vault.rootPath, oldPath, parentPath)
        const tree = await fs.scanDirectory(vault.rootPath)
        const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)

        setVault(prev => ({ ...prev, tree: sortTree(tree), notes, backlinkIndex }))
        return newPath
    }, [vault.rootPath])

    const deleteFile = useCallback(async (path: string): Promise<void> => {
        if (!vault.rootPath) throw new Error('No vault open')

        await fs.deleteFile(path)
        const tree = await fs.scanDirectory(vault.rootPath)
        const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)

        setVault(prev => ({ ...prev, tree: sortTree(tree), notes, backlinkIndex }))
    }, [vault.rootPath])

    const saveEditorState = useCallback((path: string, state: { scroll: number, cursor: number }) => {
        editorStates.current.set(path, state)
    }, [])

    const getEditorState = useCallback((path: string): { scroll: number, cursor: number } => {
        return editorStates.current.get(path) || { scroll: 0, cursor: 1 } // prose-mirror pos 1 is default
    }, [])

    const refreshTree = useCallback(async () => {
        if (!vault.rootPath) return
        const tree = await fs.scanDirectory(vault.rootPath)
        const { notes, backlinkIndex } = await buildVaultIndex(tree, fs.readFile)
        setVault(prev => ({ ...prev, tree: sortTree(tree), notes, backlinkIndex }))
    }, [vault.rootPath])

    return useMemo(() => ({
        vault,
        loadVault,
        openVault,
        readFile,
        writeFile,
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
        writeFile,
        createFile,
        createFolder,
        renameFile,
        moveFile,
        deleteFile,
        saveEditorState,
        getEditorState,
        refreshTree
    ])
}
