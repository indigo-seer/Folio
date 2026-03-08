import { createContext } from 'react'
import { VaultState } from '../lib/fs'

export interface VaultContextType {
    vault: VaultState
    fileSystem: any // Will be properly typed from useFileSystem return type
    notes: Set<string>
    backlinkIndex: Map<string, Set<string>>
    onWikilinkClick: (noteName: string) => void
}

export const VaultContext = createContext<VaultContextType>({
    vault: { rootPath: null, rootName: '', tree: [], notes: new Set(), backlinkIndex: new Map() },
    fileSystem: {} as any,
    notes: new Set(),
    backlinkIndex: new Map(),
    onWikilinkClick: () => { },
})
