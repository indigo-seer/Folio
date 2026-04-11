import { createContext, useContext, useState, ReactNode } from 'react';

export interface ModalState {
    quickSwitcher: boolean;
    settings: boolean;
    toast: string | null;
    contextMenu: { isOpen: boolean, x: number, y: number, path: string | null, kind: 'file' | 'directory' | 'root' };
    rename: { isOpen: boolean, path: string | null, initialName: string };
    folder: { isOpen: boolean, parentPath: string | null, shouldMove?: boolean };
    move: { isOpen: boolean, sourcePath: string | null, sourceKind: 'file' | 'directory' | null };
}

export interface ModalContextType {
    state: ModalState;
    openQuickSwitcher: () => void;
    closeQuickSwitcher: () => void;
    openSettings: () => void;
    closeSettings: () => void;
    showToast: (msg: string) => void;
    hideToast: () => void;
    openContextMenu: (x: number, y: number, path: string | null, kind: 'file' | 'directory' | 'root') => void;
    closeContextMenu: () => void;
    openRenameModal: (path: string, initialName: string) => void;
    closeRenameModal: () => void;
    openFolderModal: (parentPath: string | null, shouldMove?: boolean) => void;
    closeFolderModal: () => void;
    openMoveModal: (sourcePath: string, sourceKind: 'file' | 'directory') => void;
    closeMoveModal: () => void;
}

const defaultState: ModalState = {
    quickSwitcher: false,
    settings: false,
    toast: null,
    contextMenu: { isOpen: false, x: 0, y: 0, path: null, kind: 'root' },
    rename: { isOpen: false, path: null, initialName: '' },
    folder: { isOpen: false, parentPath: null },
    move: { isOpen: false, sourcePath: null, sourceKind: null }
};

export const ModalContext = createContext<ModalContextType | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ModalState>(defaultState);

    const updateState = (updates: Partial<ModalState>) => {
        setState(prev => ({ ...prev, ...updates }));
    };

    return (
        <ModalContext.Provider value={{
            state,
            openQuickSwitcher: () => updateState({ quickSwitcher: true }),
            closeQuickSwitcher: () => updateState({ quickSwitcher: false }),
            openSettings: () => updateState({ settings: true }),
            closeSettings: () => updateState({ settings: false }),
            showToast: (msg) => updateState({ toast: msg }),
            hideToast: () => updateState({ toast: null }),
            openContextMenu: (x, y, path, kind) => updateState({ contextMenu: { isOpen: true, x, y, path, kind } }),
            closeContextMenu: () => setState(prev => ({ ...prev, contextMenu: { ...prev.contextMenu, isOpen: false } })),
            openRenameModal: (path, initialName) => updateState({ rename: { isOpen: true, path, initialName } }),
            closeRenameModal: () => updateState({ rename: { isOpen: false, path: null, initialName: '' } }),
            openFolderModal: (parentPath, shouldMove) => updateState({ folder: { isOpen: true, parentPath, shouldMove } }),
            closeFolderModal: () => updateState({ folder: { isOpen: false, parentPath: null, shouldMove: false } }),
            openMoveModal: (sourcePath, sourceKind) => updateState({ move: { isOpen: true, sourcePath, sourceKind } }),
            closeMoveModal: () => updateState({ move: { isOpen: false, sourcePath: null, sourceKind: null } })
        }}>
            {children}
        </ModalContext.Provider>
    );
}

export function useModals() {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error('useModals must be used within ModalProvider');
    return ctx;
}
