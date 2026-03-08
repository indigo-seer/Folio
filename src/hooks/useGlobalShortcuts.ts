import { useEffect } from 'react';

interface UseGlobalShortcutsProps {
    setIsFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
    setIsTypewriterMode: React.Dispatch<React.SetStateAction<boolean>>;
    setIsQuickSwitcherOpen: (isOpen: boolean) => void;
    handleNewNote: () => void;
    activeTabId: string | null;
    setActiveTabId: (id: string | null) => void;
    closeTab: (id: string) => void;
}

export function useGlobalShortcuts({
    setIsFocusMode,
    setIsTypewriterMode,
    setIsQuickSwitcherOpen,
    handleNewNote,
    activeTabId,
    setActiveTabId,
    closeTab
}: UseGlobalShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrCmd = e.metaKey || e.ctrlKey;

            // Cmd+, / Ctrl+, to toggle Focus Mode
            const isFocusModeToggle = isCtrlOrCmd && !e.shiftKey && (e.key === ',' || e.code === 'Comma');
            // Cmd+. / Ctrl+. to toggle Typewriter Mode
            const isTypewriterModeToggle = isCtrlOrCmd && !e.shiftKey && (e.key === '.' || e.code === 'Period');

            if (isFocusModeToggle) {
                e.preventDefault();
                setIsFocusMode(prev => !prev);
            }
            else if (isTypewriterModeToggle) {
                e.preventDefault();
                setIsTypewriterMode(prev => !prev);
            }
            // Cmd+K / Ctrl+K to open Quick Switcher
            else if (isCtrlOrCmd && !e.shiftKey && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
                e.preventDefault();
                setIsQuickSwitcherOpen(true);
            }
            // Cmd+N / Ctrl+N to create New Note
            else if (isCtrlOrCmd && !e.shiftKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
                e.preventDefault();
                handleNewNote();
            }
            // Cmd+T / Ctrl+T to open New Tab (Quick Switcher with blank slate)
            else if (isCtrlOrCmd && !e.shiftKey && (e.key.toLowerCase() === 't' || e.code === 'KeyT')) {
                e.preventDefault();
                setActiveTabId(null);
                setIsQuickSwitcherOpen(true);
            }
            // Cmd+W / Ctrl+W to close current tab
            else if (isCtrlOrCmd && !e.shiftKey && (e.key.toLowerCase() === 'w' || e.code === 'KeyW')) {
                e.preventDefault();
                if (activeTabId) {
                    closeTab(activeTabId);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [setIsFocusMode, setIsTypewriterMode, setIsQuickSwitcherOpen, handleNewNote, activeTabId, setActiveTabId, closeTab]);
}
