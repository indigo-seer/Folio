import { FileNode, FileSystemAdapter } from './types'
import { EntryExistsError, markdownFilename, validateEntryName } from './pathSafety'

declare global {
    interface Window {
        __TAURI_INTERNALS__?: unknown
        showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
    }

    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
        getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
        getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
        removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
    }

    interface FileSystemFileHandle {
        getFile(): Promise<File>
        createWritable(): Promise<FileSystemWritableFileStream>
    }

    interface FileSystemWritableFileStream {
        write(data: string | BufferSource | Blob): Promise<void>
        close(): Promise<void>
    }
}

let browserRootHandle: FileSystemDirectoryHandle | null = null
const browserHandleCache = new Map<string, FileSystemFileHandle>()
let browserCreateQueue: Promise<void> = Promise.resolve()

function queueBrowserCreate<T>(create: () => Promise<T>): Promise<T> {
    const next = browserCreateQueue.then(create, create)
    browserCreateQueue = next.then(() => undefined, () => undefined)
    return next
}

async function browserGetDirHandle(dirPath: string): Promise<FileSystemDirectoryHandle> {
    if (!browserRootHandle) throw new Error('No vault open')
    if (!dirPath) return browserRootHandle
    const parts = dirPath.split('/')
    let current = browserRootHandle
    for (const part of parts) {
        current = await current.getDirectoryHandle(part)
    }
    return current
}

async function browserGetParentHandle(path: string): Promise<FileSystemDirectoryHandle> {
    if (!browserRootHandle) throw new Error('No vault open')
    const parts = path.split('/')
    let current = browserRootHandle
    for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
    }
    return current
}

async function browserEntryExists(parent: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
        await parent.getFileHandle(name)
        return true
    } catch {
        try {
            await parent.getDirectoryHandle(name)
            return true
        } catch {
            return false
        }
    }
}

export const browserFs: FileSystemAdapter = {
    openVault: async () => {
        if (!window.showDirectoryPicker) {
            alert('Your browser does not support folder access. Please use Chrome or Edge, or download the desktop app.')
            return null
        }
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        browserRootHandle = dirHandle
        browserHandleCache.clear()
        return { path: dirHandle.name, name: dirHandle.name }
    },

    loadVault: async (_path: string) => {
        throw new Error('loadVault by path is not supported in the browser because directory handles cannot be restored automatically without IndexedDB.')
    },

    scanDirectory: async function scan(path: string, dirHandle?: FileSystemDirectoryHandle): Promise<FileNode[]> {
        const handleToScan = dirHandle || browserRootHandle
        if (!handleToScan) throw new Error('No vault open')
        // The browser root name is a display label, not a traversable child.
        const relativePath = !dirHandle && path === browserRootHandle?.name ? '' : path

        const nodes: FileNode[] = []
        for await (const entry of handleToScan.values()) {
            if (entry.name.startsWith('.')) continue
            const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

            if (entry.kind === 'file') {
                if (!entry.name.endsWith('.md')) continue
                browserHandleCache.set(entryPath, entry as FileSystemFileHandle)
                nodes.push({ name: entry.name, path: entryPath, kind: 'file', _handle: entry as FileSystemFileHandle })
            } else if (entry.kind === 'directory') {
                const children = await scan(entryPath, entry as FileSystemDirectoryHandle)
                nodes.push({ name: entry.name, path: entryPath, kind: 'directory', _handle: entry as FileSystemDirectoryHandle, children })
            }
        }
        return nodes
    },

    readFile: async (path: string) => {
        const handle = browserHandleCache.get(path)
        if (!handle) throw new Error(`Browser: file handle not found for ${path}`)
        const file = await handle.getFile()
        return file.text()
    },

    writeFile: async (path: string, content: string) => {
        const handle = browserHandleCache.get(path)
        if (!handle) throw new Error(`Browser: file handle not found for ${path}`)
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
    },

    createFile: (_rootPath: string, name: string, parentPath?: string) => queueBrowserCreate(async () => {
        if (!browserRootHandle) throw new Error('No vault open')
        const filename = markdownFilename(name)
        const newPath = parentPath ? `${parentPath}/${filename}` : filename
        const parentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle
        if (await browserEntryExists(parentHandle, filename)) {
            throw new EntryExistsError(`A file named "${filename}" already exists.`)
        }
        const handle = await parentHandle.getFileHandle(filename, { create: true })
        const writable = await handle.createWritable()
        await writable.write('')
        await writable.close()
        browserHandleCache.set(newPath, handle)
        return newPath
    }),

    createFolder: async (_rootPath: string, name: string, parentPath?: string) => {
        if (!browserRootHandle) throw new Error('No vault open')
        const validName = validateEntryName(name)
        const newPath = parentPath ? `${parentPath}/${validName}` : validName
        const parentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle
        if (await browserEntryExists(parentHandle, validName)) {
            throw new EntryExistsError(`An entry named "${validName}" already exists.`)
        }
        await parentHandle.getDirectoryHandle(validName, { create: true })
        return newPath
    },

    renameFile: async (oldPath: string, newFilename: string) => {
        const parentHandle = await browserGetParentHandle(oldPath)
        const oldFilename = oldPath.split('/').pop()!
        const parts = oldPath.split('/')
        parts.pop()

        const isFile = oldPath.endsWith('.md')
        const finalName = isFile ? markdownFilename(newFilename) : validateEntryName(newFilename)
        const newPath = parts.length > 0 ? `${parts.join('/')}/${finalName}` : finalName

        if (newPath === oldPath) return oldPath
        if (await browserEntryExists(parentHandle, finalName)) {
            throw new EntryExistsError(`An entry named "${finalName}" already exists.`)
        }

        const oldHandle = browserHandleCache.get(oldPath)
        if (!oldHandle) throw new Error(`Browser: handle not found for ${oldPath}`)
        const file = await oldHandle.getFile()
        const content = await file.text()

        const newHandle = await parentHandle.getFileHandle(finalName, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()
        await parentHandle.removeEntry(oldFilename)

        browserHandleCache.delete(oldPath)
        browserHandleCache.set(newPath, newHandle)
        return newPath
    },

    moveFile: async (_rootPath: string, oldPath: string, parentPath?: string) => {
        const isFile = oldPath.endsWith('.md')
        if (!isFile) throw new Error('Browser: Moving directories is not supported. Please use the desktop app.')

        const filename = oldPath.split('/').pop()!
        const newPath = parentPath ? `${parentPath}/${filename}` : filename

        const oldHandle = browserHandleCache.get(oldPath)
        if (!oldHandle) throw new Error(`Browser: handle not found for ${oldPath}`)
        const file = await oldHandle.getFile()
        const content = await file.text()

        const newParentHandle = parentPath ? await browserGetDirHandle(parentPath) : browserRootHandle!
        if (newPath === oldPath) return oldPath
        if (await browserEntryExists(newParentHandle, filename)) {
            throw new EntryExistsError(`A file named "${filename}" already exists at the destination.`)
        }
        const newHandle = await newParentHandle.getFileHandle(filename, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()

        const oldParentHandle = await browserGetParentHandle(oldPath)
        await oldParentHandle.removeEntry(filename)

        browserHandleCache.delete(oldPath)
        browserHandleCache.set(newPath, newHandle)
        return newPath
    },

    deleteFile: async (path: string) => {
        const parentHandle = await browserGetParentHandle(path)
        const filename = path.split('/').pop()!
        await parentHandle.removeEntry(filename, { recursive: true })
        browserHandleCache.delete(path)
    }
}
