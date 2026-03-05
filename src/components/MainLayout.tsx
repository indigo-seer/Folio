import { ReactNode, useEffect, useState, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { GraphView } from './GraphView';
import { useModals } from '../contexts/ModalContext';

interface MainLayoutProps {
    fileSystem: any;
    tabs: any;
    fileOperations: any;
    activeTabId: string | null;
    editorNode: ReactNode;
    isFocusMode: boolean;
    setIsFocusMode: (f: boolean) => void;
    isTypewriterMode: boolean;
    setIsTypewriterMode: (t: boolean) => void;
}

export function MainLayout({
    fileSystem,
    tabs,
    fileOperations,
    activeTabId,
    editorNode,
    isFocusMode,
    setIsFocusMode,
    isTypewriterMode,
    setIsTypewriterMode
}: MainLayoutProps) {
    const { theme, setTheme } = useSettings();
    const { workspaces, activeWorkspaceId, handleOpenWorkspace, handleSelectWorkspace, handleRemoveWorkspace } = useWorkspace();
    const modals = useModals();

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isUIVisible, setIsUIVisible] = useState(true);
    const isUIVisibleRef = useRef(true);

    const updateUIVisibility = (visible: boolean) => {
        setIsUIVisible(visible);
        isUIVisibleRef.current = visible;
    };

    const [isTypewriterSuspended, setIsTypewriterSuspended] = useState(false);

    // Focus Mode logic
    useEffect(() => {
        if (!isFocusMode) {
            updateUIVisibility(true);
            return;
        }

        let timeoutId: number;
        let lastX: number | null = null;
        let lastY: number | null = null;
        let accumulatedDistance = 0;

        const handleMouseMove = (e: MouseEvent) => {
            // If the UI is already visible, just reset the timeout
            if (isUIVisibleRef.current) {
                window.clearTimeout(timeoutId);
                timeoutId = window.setTimeout(() => {
                    updateUIVisibility(false);
                }, 1500);
                return;
            }

            // UI is hidden, calculate intentional movement stroke
            if (lastX === null || lastY === null) {
                lastX = e.clientX;
                lastY = e.clientY;
                return;
            }

            const dx = Math.abs(e.clientX - lastX);
            const dy = Math.abs(e.clientY - lastY);
            accumulatedDistance += dx + dy;

            lastX = e.clientX;
            lastY = e.clientY;

            // Require 75 pixels of continuous brushing to reveal the UI
            if (accumulatedDistance > 75) {
                updateUIVisibility(true);
                accumulatedDistance = 0; // reset for the next stroke

                window.clearTimeout(timeoutId);
                timeoutId = window.setTimeout(() => {
                    updateUIVisibility(false);
                }, 1500); // Hide after 1.5s of inactivity
            }
        };

        updateUIVisibility(false);

        document.addEventListener('mousemove', handleMouseMove);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            window.clearTimeout(timeoutId);
        };
    }, [isFocusMode]);

    // Listen for Typewriter Mode manual scroll override from the extension
    useEffect(() => {
        const handleTypewriterSuspend = (e: Event) => {
            const customEvent = e as CustomEvent<boolean>;
            setIsTypewriterSuspended(customEvent.detail);
        };
        window.addEventListener('folio:typewriter-manual-scroll', handleTypewriterSuspend);
        return () => window.removeEventListener('folio:typewriter-manual-scroll', handleTypewriterSuspend);
    }, []);

    const activeTab = tabs.tabs.find((t: any) => t.id === activeTabId);
    const activeFileName = activeTab?.title || 'Folio';

    return (
        <div className={`flex h-screen overflow-hidden ${isFocusMode ? 'bg-folio-bg dark:bg-folio-dark-bg' : ''}`}>
            {/* Sidebar */}
            <div
                className={`transition-all duration-700 ease-in-out flex-shrink-0 relative overflow-hidden ${isFocusMode && !isUIVisible ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    width: isFocusMode && !isUIVisible ? '0px' : sidebarCollapsed ? '0px' : '260px',
                    pointerEvents: isFocusMode && !isUIVisible ? 'none' : 'auto'
                }}
            >
                <Sidebar
                    isCollapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(prev => !prev)}
                    vaultName={fileSystem.vault.rootName}
                    tree={fileSystem.vault.tree}
                    activeFilePath={tabs.tabs.find((t: any) => t.id === activeTabId)?.path || null}
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspaceId}
                    onFileSelect={(path) => {
                        const title = path.split(/[\/\\]/).pop()?.replace(/\.md$/, '') || 'Untitled';
                        tabs.openTab({ id: path, type: 'markdown', title, path });
                    }}
                    onFileContextMenu={(path, kind, x, y) => modals.openContextMenu(x, y, path, kind)}
                    onOpenVault={handleOpenWorkspace}
                    onSelectVault={handleSelectWorkspace}
                    onRemoveVault={handleRemoveWorkspace}
                    onNewNote={() => fileOperations.handleNewNote()}
                    onOpenGraph={() => tabs.openTab({ id: 'folio-graph', type: 'graph', title: 'Graph View' })}
                    onOpenSettings={modals.openSettings}
                />
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-folio-bg dark:bg-folio-dark-bg transition-colors duration-folio relative">
                {/* Tab Bar Container */}
                <div
                    className={`transition-all duration-700 ease-in-out flex-shrink-0 overflow-hidden ${isFocusMode && !isUIVisible ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                        height: isFocusMode && !isUIVisible ? '0px' : '45px',
                        pointerEvents: isFocusMode && !isUIVisible ? 'none' : 'auto'
                    }}
                >
                    <TabBar
                        tabs={tabs.tabs}
                        activeTabId={activeTabId}
                        onTabSelect={tabs.setActiveTabId}
                        onTabClose={tabs.closeTab}
                        sidebarCollapsed={sidebarCollapsed}
                        onToggleSidebar={() => setSidebarCollapsed(false)}
                        theme={theme}
                        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    />
                </div>

                {/* Empty State when no tabs open */}
                {!activeTabId && (
                    <div className="flex-1 flex flex-col items-center justify-center text-folio-text-secondary dark:text-folio-dark-text-secondary">
                        <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="font-sans text-lg">No file is open</p>
                        <p className="font-sans text-sm mt-2 opacity-75">Select a file from the sidebar or create a new note</p>
                    </div>
                )}

                {/* Graph View */}
                {activeTabId === 'folio-graph' && (
                    <div className="flex-1 overflow-hidden h-full">
                        <GraphView />
                    </div>
                )}

                {/* Editor Area */}
                <div className={`flex-1 relative ${activeTabId && activeTabId !== 'folio-graph' ? 'block' : 'hidden'}`}>
                    {/* The Editor is passed as a child/prop to avoid recreating it on layout state changes */}
                    {editorNode}
                    {isTypewriterMode && (
                        <div className={`typewriter-blur-overlay transition-opacity duration-500 ${isTypewriterSuspended ? 'opacity-0' : 'opacity-100'}`} />
                    )}
                </div>

                {/* Status Bar */}
                <div
                    className={`transition-all duration-700 ease-in-out overflow-hidden ${isFocusMode && !isUIVisible ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                        maxHeight: isFocusMode && !isUIVisible ? '0px' : '40px', // status bar is typically ~37px tall
                        pointerEvents: isFocusMode && !isUIVisible ? 'none' : 'auto'
                    }}
                >
                    {activeTabId && (
                        <StatusBar
                            activeFileName={activeFileName}
                            isTypewriterMode={isTypewriterMode}
                            onToggleTypewriter={() => setIsTypewriterMode(!isTypewriterMode)}
                            isFocusMode={isFocusMode}
                            onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
