import { createContext } from 'react'

export interface VaultContextType {
    notes: Set<string>
    backlinkIndex: Map<string, Set<string>>
    onWikilinkClick: (noteName: string) => void
}

export const VaultContext = createContext<VaultContextType>({
    notes: new Set(),
    backlinkIndex: new Map(),
    onWikilinkClick: () => { },
})
