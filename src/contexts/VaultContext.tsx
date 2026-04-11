import { createContext } from 'react'
import { VaultState } from '../lib/fs'
import type { FileSystemAPI } from '../hooks/useFileSystem'

export interface VaultContextType {
    vault: VaultState
    fileSystem: FileSystemAPI
    notes: Set<string>
    backlinkIndex: Map<string, Set<string>>
    onWikilinkClick: (noteName: string, anchor?: string | null) => void
}

export const VaultContext = createContext<VaultContextType>({
    vault: { rootPath: null, rootName: '', tree: [], notes: new Set(), backlinkIndex: new Map() },
    fileSystem: {} as FileSystemAPI,
    notes: new Set(),
    backlinkIndex: new Map(),
    onWikilinkClick: () => { },
})
