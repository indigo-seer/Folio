import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsProvider } from './hooks/useSettings';
import { useFileSystem } from './hooks/useFileSystem';
import { useTabs } from './hooks/useTabs';

import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingModal } from './components/OnboardingModal';
import { Editor } from './components/Editor';
import { CorruptionBanner } from './components/CorruptionBanner';

import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { ModalProvider, useModals } from './contexts/ModalContext';
import { VaultContext } from './contexts/VaultContext';

import { useAppBootloader } from './hooks/useAppBootloader';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useEditorState } from './hooks/useEditorState';
import { useFileOperations } from './hooks/useFileOperations';
import { recordTypingUpdate, startPerformanceAudit } from './lib/performanceAudit';

import { MainLayout } from './components/MainLayout';
import { ModalRoot } from './components/ModalRoot';
import { NoteTitle } from './components/NoteTitle';
import { useWorkspace } from './contexts/WorkspaceContext';
import type { FileSystemAPI } from './hooks/useFileSystem';
import type { TabsAPI } from './hooks/useTabs';
import type { Editor as TipTapEditor } from '@tiptap/react';
import { EditorModeProvider, useEditorMode } from './contexts/EditorModeContext';
import { GRAPH_TAB_ID } from './lib/constants';

type AptabaseProps = Record<string, string | number>;

// @aptabase/tauri@0.4.1 still targets Tauri v1 and calls __TAURI_IPC__.
// Invoke the Tauri v2 plugin command directly instead.
function trackEvent(name: string, props?: AptabaseProps): Promise<void> {
    return invoke('plugin:aptabase|track_event', { name, props });
}

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
    useEffect(() => {
        return startPerformanceAudit();
    }, []);

    // Initial Bootloader & Workspace Mgmt
    // Notice: setWorkspaces and setActiveWorkspaceId are managed by WorkspaceProvider, 
    // but the Bootloader needs to set them initially. So we expose them or use the provider directly.
    // For simplicity, handle initialization in the component or via a more integrated provider layer.
    // This is a slight adaptation from the implementation plan for React Context hierarchy.
    return (
        <WorkspaceProvider fileSystem={fileSystem} tabs={tabs} setBootState={setBootState} showToast={modals.showToast}>
            <EditorModeProvider>
                <BootloaderWrappedContent
                    bootState={bootState}
                    setBootState={setBootState}
                    fileSystem={fileSystem}
                    tabs={tabs}
                />
            </EditorModeProvider>
        </WorkspaceProvider>
    );
}

interface BootloaderContentProps {
    bootState: BootState;
    setBootState: (s: BootState) => void;
    fileSystem: FileSystemAPI;
    tabs: TabsAPI;
}

function BootloaderWrappedContent({ bootState, setBootState, fileSystem, tabs }: BootloaderContentProps) {
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
            <div className="flex h-screen items-center justify-center bg-folium-bg dark:bg-folium-dark-bg">
                <div className="animate-pulse w-3 h-3 rounded-full bg-folium-text-secondary/30 dark:bg-folium-dark-text-secondary/30" />
            </div>
        );
    }

    return (
        <VaultProviderWrapped
            fileSystem={fileSystem}
            tabs={tabs}
            isOnboardingOpen={isOnboardingOpen}
            handleOnboardingComplete={handleOnboardingComplete}
        />
    );
}

interface VaultWrappedProps {
    fileSystem: FileSystemAPI;
    tabs: TabsAPI;
    isOnboardingOpen: boolean;
    handleOnboardingComplete: (mode: 'pick' | 'create') => Promise<void>;
}

function VaultProviderWrapped({ fileSystem, tabs, isOnboardingOpen, handleOnboardingComplete }: VaultWrappedProps) {
    const modals = useModals();
    const { setIsFocusMode, isTypewriterMode, setIsTypewriterMode } = useEditorMode();
    const [focusedPane, setFocusedPane] = useState<'main' | 'split'>('main');

    const {
        editorRef: mainEditorRef,
        editorScrollRef: mainEditorScrollRef,
        isNewNote,
        setIsNewNote,
        corruptionWarnings: mainCorruptionWarnings,
        externalChangeWarning: mainExternalChangeWarning,
        reloadActiveTabFromDisk: reloadMainFromDisk,
        handleEditorUpdate: handleMainEditorUpdate,
        handleEditorReady: handleMainEditorReady
    } = useEditorState({
        activeTabId: tabs.activeTabId,
        tabs: tabs.tabs,
        fileSystem,
        isMoveModalOpen: modals.state.move.isOpen,
        vaultRootPath: fileSystem.vault.rootPath,
        onError: modals.showToast
    });

    const {
        editorScrollRef: splitEditorScrollRef,
        corruptionWarnings: splitCorruptionWarnings,
        externalChangeWarning: splitExternalChangeWarning,
        reloadActiveTabFromDisk: reloadSplitFromDisk,
        handleEditorUpdate: handleSplitEditorUpdate,
        handleEditorReady: handleSplitEditorReady
    } = useEditorState({
        activeTabId: tabs.splitTabId || null,
        tabs: tabs.tabs,
        fileSystem,
        isMoveModalOpen: modals.state.move.isOpen,
        vaultRootPath: fileSystem.vault.rootPath,
        onError: modals.showToast
    })

    const renderedTabIdRef = useRef<string | null>(null);

    const auditedMainEditorUpdate = useCallback((editor: TipTapEditor) => {
        const docSize = Number(editor?.state?.doc?.content?.size ?? 0);
        recordTypingUpdate('main', docSize);
        handleMainEditorUpdate(editor);
    }, [handleMainEditorUpdate]);

    const auditedSplitEditorUpdate = useCallback((editor: TipTapEditor) => {
        const docSize = Number(editor?.state?.doc?.content?.size ?? 0);
        recordTypingUpdate('split', docSize);
        handleSplitEditorUpdate(editor);
    }, [handleSplitEditorUpdate]);

    useEffect(() => {
        if (!tabs.splitTabId) {
            setFocusedPane('main');
        }
    }, [tabs.splitTabId]);

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
            if (next && mainEditorRef.current) {
                // Give the attribute time to propagate then center by focusing
                requestAnimationFrame(() => {
                    mainEditorRef.current?.commands.focus();
                    window.dispatchEvent(new CustomEvent('folium:typewriter-toggled'));
                });
            }
            return next;
        });
    }, [setIsTypewriterMode, mainEditorRef]);

    const focusedTabId = focusedPane === 'split' && tabs.splitTabId
        ? tabs.splitTabId
        : tabs.activeTabId;

    // Hook: Global Shortcuts
    useGlobalShortcuts({
        setIsFocusMode: setIsFocusMode,
        toggleTypewriterMode: toggleTypewriter,
        setIsQuickSwitcherOpen: () => modals.openQuickSwitcher(),
        handleNewNote: () => fileOperations.handleNewNote(),
        handleExportPdf: () => fileOperations.handleExportNoteAsPdf(),
        activeTabId: focusedTabId,
        closeTab: (id: string) => {
            if (focusedPane === 'split' && tabs.splitTabId === id && tabs.closeTabInPane) {
                tabs.closeTabInPane('split', id)
            } else if (tabs.closeTabInPane) {
                tabs.closeTabInPane('main', id)
            } else {
                tabs.closeTab(id)
            }
        }
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
                focusedPane={focusedPane}
                onFocusPane={setFocusedPane}
                splitTabId={tabs.splitTabId}
                onCloseSplit={tabs.closeSplitTab}
                editorNode={
                    <div
                        className={`absolute inset-0 overflow-y-auto overscroll-none ${isTypewriterMode ? 'typewriter-active-container' : ''}`}
                        ref={mainEditorScrollRef}
                    >
                        <div>
                            {tabs.activeTabId && tabs.activeTabId !== GRAPH_TAB_ID && (
                                <>
                                    <CorruptionBanner warnings={mainCorruptionWarnings} />
                                    <CorruptionBanner
                                        warnings={mainExternalChangeWarning ? [mainExternalChangeWarning] : []}
                                        title="This note changed on disk while you were editing."
                                        hint="Folium paused auto-save to prevent overwriting newer file contents. Reload this note and merge your changes."
                                        actionLabel="Reload from disk"
                                        onAction={reloadMainFromDisk}
                                    />
                                    <NoteTitle
                                        title={tabs.tabs.find(t => t.id === tabs.activeTabId)?.title || 'Folium'}
                                        onRename={fileOperations.handleRename}
                                        autoFocus={isNewNote}
                                    />
                                </>
                            )}
                        </div>
                        <div>
                            <Editor
                                onUpdate={auditedMainEditorUpdate}
                                onReady={handleMainEditorReady}
                                onFocus={() => setFocusedPane('main')}
                                isTypewriterMode={isTypewriterMode}
                            />
                        </div>
                    </div>
                }
                splitEditorNode={
                    tabs.splitTabId ? (
                        <div className={`absolute inset-0 overflow-y-auto overscroll-none ${isTypewriterMode ? 'typewriter-active-container' : ''}`} ref={splitEditorScrollRef}>
                            <div>
                                <CorruptionBanner warnings={splitCorruptionWarnings} />
                                <CorruptionBanner
                                    warnings={splitExternalChangeWarning ? [splitExternalChangeWarning] : []}
                                    title="This note changed on disk while you were editing."
                                    hint="Folium paused auto-save to prevent overwriting newer file contents. Reload this note and merge your changes."
                                    actionLabel="Reload from disk"
                                    onAction={reloadSplitFromDisk}
                                />
                                <div className="max-w-prose-folium mx-auto px-6 pt-10 pb-2">
                                    <h1 className="note-title text-folium-text dark:text-folium-dark-text font-serif font-light m-0 pb-1 border-b-2 border-transparent">
                                        {tabs.tabs.find(t => t.id === tabs.splitTabId)?.title || 'Untitled'}
                                    </h1>
                                </div>
                            </div>
                            <div>
                                <Editor
                                    onUpdate={auditedSplitEditorUpdate}
                                    onReady={handleSplitEditorReady}
                                    onFocus={() => setFocusedPane('split')}
                                    isTypewriterMode={isTypewriterMode}
                                />
                            </div>
                        </div>
                    ) : null
                }
            />

            <ModalRoot
                activeTabId={focusedTabId}
                focusedPane={focusedPane}
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
    useEffect(() => {
        // Log app open for Aptabase
        trackEvent('app_opened');

        const sessionStart = Date.now();
        
        // Listen for when the Tauri window is about to close
        // Do not await telemetry from the close-request handler. Tauri only
        // destroys the window after this handler resolves, so a failed or slow
        // Aptabase request can make both the title-bar X and native close
        // requests appear to do nothing.
        const unlistenPromise = getCurrentWindow().onCloseRequested(() => {
            const duration_seconds = Math.round((Date.now() - sessionStart) / 1000);
            void trackEvent('app_closed', { duration_seconds }).catch(() => {
                // Shutdown telemetry is best effort and must never block close.
            });
        });

        return () => {
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);

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
