import { useState, useCallback, useRef, useMemo } from 'react';
import { SettingsProvider } from './hooks/useSettings';
import { useFileSystem } from './hooks/useFileSystem';
import { useTabs } from './hooks/useTabs';

import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingModal } from './components/OnboardingModal';
import { Editor } from './components/Editor';

import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { ModalProvider, useModals } from './contexts/ModalContext';
import { VaultContext } from './contexts/VaultContext';

import { useAppBootloader } from './hooks/useAppBootloader';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useEditorState } from './hooks/useEditorState';
import { useFileOperations } from './hooks/useFileOperations';

import { MainLayout } from './components/MainLayout';
import { ModalRoot } from './components/ModalRoot';
import { NoteTitle } from './components/NoteTitle';
import { useWorkspace } from './contexts/WorkspaceContext';

export enum BootState {
    Initializing,
    ReadyWithWorkspace,
    ReadyWithoutWorkspace
}

function AppContentInner() {
    // Contexts and Hooks
    const fileSystem = useFileSystem();
    const tabs = useTabs();
    const modals = useModals();

    const [bootState, setBootState] = useState<BootState>(BootState.Initializing);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isTypewriterMode, setIsTypewriterMode] = useState(false);

    // Initial Bootloader & Workspace Mgmt
    // Notice: setWorkspaces and setActiveWorkspaceId are managed by WorkspaceProvider, 
    // but the Bootloader needs to set them initially. So we expose them or use the provider directly.
    // For simplicity, handle initialization in the component or via a more integrated provider layer.
    // This is a slight adaptation from the implementation plan for React Context hierarchy.
    return (
        <WorkspaceProvider fileSystem={fileSystem} tabs={tabs} setBootState={setBootState} showToast={modals.showToast}>
            <BootloaderWrappedContent
                bootState={bootState}
                setBootState={setBootState}
                fileSystem={fileSystem}
                tabs={tabs}
                isFocusMode={isFocusMode}
                setIsFocusMode={setIsFocusMode}
                isTypewriterMode={isTypewriterMode}
                setIsTypewriterMode={setIsTypewriterMode}
            />
        </WorkspaceProvider>
    );
}

function BootloaderWrappedContent({ bootState, setBootState, fileSystem, tabs, isFocusMode, setIsFocusMode, isTypewriterMode, setIsTypewriterMode }: any) {
    const { setWorkspaces, setActiveWorkspaceId } = useWorkspace();

    // Hook: App Bootloader
    const { isOnboardingOpen, handleOnboardingComplete } = useAppBootloader(
        fileSystem,
        tabs,
        setWorkspaces,
        setActiveWorkspaceId,
        setBootState
    );

    // Initial Loading State
    if (bootState === BootState.Initializing) {
        if (isOnboardingOpen) {
            return <OnboardingModal onComplete={handleOnboardingComplete} />;
        }
        return (
            <div className="flex h-screen items-center justify-center bg-folio-bg dark:bg-folio-dark-bg">
                <div className="animate-pulse w-3 h-3 rounded-full bg-folio-text-secondary/30 dark:bg-folio-dark-text-secondary/30" />
            </div>
        );
    }

    return (
        <VaultProviderWrapped
            fileSystem={fileSystem}
            tabs={tabs}
            isFocusMode={isFocusMode}
            setIsFocusMode={setIsFocusMode}
            isTypewriterMode={isTypewriterMode}
            setIsTypewriterMode={setIsTypewriterMode}
            isOnboardingOpen={isOnboardingOpen}
            handleOnboardingComplete={handleOnboardingComplete}
        />
    );
}

function VaultProviderWrapped({ fileSystem, tabs, isFocusMode, setIsFocusMode, isTypewriterMode, setIsTypewriterMode, isOnboardingOpen, handleOnboardingComplete }: any) {
    const modals = useModals();

    const {
        editorRef,
        editorScrollRef,
        isNewNote,
        setIsNewNote,
        handleEditorUpdate,
        handleEditorReady
    } = useEditorState({
        activeTabId: tabs.activeTabId,
        tabs: tabs.tabs,
        fileSystem,
        isMoveModalOpen: modals.state.move.isOpen
    });

    const renderedTabIdRef = useRef<string | null>(null);

    // Hook: File Operations
    const fileOperations = useFileOperations({
        fileSystem,
        tabs,
        activeTabId: tabs.activeTabId,
        renderedTabIdRef,
        setIsNewNote
    });

    // Handle Typewriter Toggle with Focus
    const toggleTypewriter = useCallback(() => {
        setIsTypewriterMode((prev: boolean) => {
            const next = !prev;
            if (next && editorRef.current) {
                // Give the attribute time to propagate then center by focusing
                requestAnimationFrame(() => {
                    editorRef.current?.commands.focus();
                    window.dispatchEvent(new CustomEvent('folio:typewriter-toggled'));
                });
            }
            return next;
        });
    }, [setIsTypewriterMode, editorRef]);

    // Hook: Global Shortcuts
    useGlobalShortcuts({
        setIsFocusMode: setIsFocusMode,
        setIsTypewriterMode: toggleTypewriter as any,
        setIsQuickSwitcherOpen: () => modals.openQuickSwitcher(),
        handleNewNote: () => fileOperations.handleNewNote(),
        handleExportPdf: () => fileOperations.handleExportNoteAsPdf(),
        activeTabId: tabs.activeTabId,
        setActiveTabId: tabs.setActiveTabId,
        closeTab: tabs.closeTab
    });

    const vaultContextValue = useMemo(() => ({
        vault: fileSystem.vault,
        fileSystem,
        notes: fileSystem.vault.notes,
        backlinkIndex: fileSystem.vault.backlinkIndex,
        onWikilinkClick: fileOperations.handleWikilinkClick
    }), [fileSystem, fileSystem.vault, fileSystem.vault.notes, fileSystem.vault.backlinkIndex, fileOperations.handleWikilinkClick]);

    return (
        <VaultContext.Provider value={vaultContextValue}>
            <MainLayout
                fileSystem={fileSystem}
                tabs={tabs}
                fileOperations={fileOperations}
                activeTabId={tabs.activeTabId}
                isFocusMode={isFocusMode}
                setIsFocusMode={setIsFocusMode}
                isTypewriterMode={isTypewriterMode}
                setIsTypewriterMode={setIsTypewriterMode}
                editorNode={
                    <div
                        className={`absolute inset-0 overflow-y-auto overscroll-none ${isTypewriterMode ? 'typewriter-active-container' : ''}`}
                        ref={editorScrollRef}
                    >
                        <div>
                            {tabs.activeTabId && tabs.activeTabId !== 'folio-graph' && (
                                <NoteTitle
                                    title={tabs.tabs.find((t: any) => t.id === tabs.activeTabId)?.title || 'Folio'}
                                    onRename={fileOperations.handleRename}
                                    autoFocus={isNewNote}
                                />
                            )}
                        </div>
                        <div>
                            <Editor
                                onUpdate={handleEditorUpdate}
                                onReady={handleEditorReady}
                                isTypewriterMode={isTypewriterMode}
                            />
                        </div>
                    </div>
                }
            />

            <ModalRoot
                activeTabId={tabs.activeTabId}
                tabs={tabs}
                fileSystem={fileSystem}
                fileOperations={fileOperations}
            />

            {/* Global Onboarding Overlay if triggered post-boot */}
            {isOnboardingOpen && (
                <OnboardingModal onComplete={handleOnboardingComplete} />
            )}
        </VaultContext.Provider>
    );
}


export default function App() {
    return (
        <ErrorBoundary>
            <SettingsProvider>
                <ModalProvider>
                    <AppContentInner />
                </ModalProvider>
            </SettingsProvider>
        </ErrorBoundary>
    );
}
