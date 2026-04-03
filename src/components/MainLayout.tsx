import { ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { GraphView } from './GraphView';
import { useModals } from '../contexts/ModalContext';
import { startAnimationAudit } from '../lib/performanceAudit';

interface MainLayoutProps {
    fileSystem: any;
    tabs: any;
    fileOperations: any;
    activeTabId: string | null;
    focusedPane?: 'main' | 'split';
    onFocusPane?: (pane: 'main' | 'split') => void;
    editorNode: ReactNode;
    splitTabId?: string | null;
    splitEditorNode?: ReactNode;
    onCloseSplit?: () => void;
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
    focusedPane = 'main',
    onFocusPane,
    editorNode,
    splitTabId = null,
    splitEditorNode = null,
    onCloseSplit,
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
    const splitHostRef = useRef<HTMLDivElement | null>(null);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [isResizingSplit, setIsResizingSplit] = useState(false);

    const updateUIVisibility = (visible: boolean) => {
        setIsUIVisible(visible);
        isUIVisibleRef.current = visible;
    };

    const [isTypewriterSuspended, setIsTypewriterSuspended] = useState(false);
    const hasSplitPane = Boolean(splitTabId && splitEditorNode);
    const safeSplitRatio = Math.min(0.78, Math.max(0.22, splitRatio));
    const mainPaneWidth = `${safeSplitRatio * 100}%`;
    const splitPaneWidth = `${(1 - safeSplitRatio) * 100}%`;

    const updateSplitRatioFromClientX = useCallback((clientX: number) => {
        const host = splitHostRef.current;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        if (rect.width <= 0) return;
        const nextRatio = (clientX - rect.left) / rect.width;
        const clampedRatio = Math.min(0.78, Math.max(0.22, nextRatio));
        setSplitRatio(clampedRatio);
    }, []);

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
        window.addEventListener('folium:typewriter-manual-scroll', handleTypewriterSuspend);
        return () => window.removeEventListener('folium:typewriter-manual-scroll', handleTypewriterSuspend);
    }, []);

    useEffect(() => {
        if (!isResizingSplit) return;

        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (event: MouseEvent) => {
            updateSplitRatioFromClientX(event.clientX);
        };

        const handleMouseUp = () => {
            setIsResizingSplit(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingSplit, updateSplitRatioFromClientX]);

    useEffect(() => {
        if (!hasSplitPane && isResizingSplit) {
            setIsResizingSplit(false);
        }
    }, [hasSplitPane, isResizingSplit]);

    useEffect(() => {
        if (!isFocusMode) return;
        const label = isUIVisible ? 'focus-mode-ui-reveal' : 'focus-mode-ui-collapse';
        return startAnimationAudit(label, 950);
    }, [isFocusMode, isUIVisible]);

    const activeTab = tabs.tabs.find((t: any) => t.id === activeTabId);
    const activeFileName = activeTab?.title || 'Folium';

    return (
        <div className={`flex h-screen overflow-hidden ${isFocusMode ? 'bg-folium-bg dark:bg-folium-dark-bg' : ''}`}>
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
                    onOpenGraph={() => tabs.openTab({ id: 'folium-graph', type: 'graph', title: 'Graph View' })}
                    onOpenSettings={modals.openSettings}
                />
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-folium-bg dark:bg-folium-dark-bg transition-colors duration-folium relative">
                {/* Tab Bar Container */}
                <div
                    className={`transition-all duration-700 ease-in-out flex-shrink-0 overflow-hidden ${isFocusMode && !isUIVisible ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                        height: isFocusMode && !isUIVisible ? '0px' : '45px',
                        pointerEvents: isFocusMode && !isUIVisible ? 'none' : 'auto'
                    }}
                >
                    <TabBar
                        tabs={tabs.mainTabs || tabs.tabs}
                        activeTabId={activeTabId}
                        splitTabs={tabs.splitTabs || []}
                        splitTabId={splitTabId}
                        splitRatio={safeSplitRatio}
                        focusedPane={focusedPane}
                        onTabSelect={(id) => {
                            onFocusPane?.('main')
                            tabs.setActiveTabId(id)
                        }}
                        onTabClose={(id) => (tabs.closeTabInPane ? tabs.closeTabInPane('main', id) : tabs.closeTab(id))}
                        onSplitTabSelect={(id) => {
                            onFocusPane?.('split')
                            tabs.setSplitTabId(id)
                        }}
                        onSplitTabClose={(id) => (tabs.closeTabInPane ? tabs.closeTabInPane('split', id) : tabs.closeTab(id))}
                        onPaneFocus={onFocusPane}
                        sidebarCollapsed={sidebarCollapsed}
                        onToggleSidebar={() => setSidebarCollapsed(false)}
                        theme={theme}
                        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    />
                </div>

                {/* Empty State when no tabs open */}
                {!activeTabId && (
                    <div className="flex-1 flex flex-col items-center justify-center text-folium-text-secondary dark:text-folium-dark-text-secondary">
                        <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="font-sans text-lg">No file is open</p>
                        <p className="font-sans text-sm mt-2 opacity-75">Select a file from the sidebar or create a new note</p>
                    </div>
                )}

                {/* Graph View */}
                {activeTabId === 'folium-graph' && (
                    <div className="flex-1 overflow-hidden h-full">
                        <GraphView />
                    </div>
                )}

                {/* Editor Area */}
                <div className={`flex-1 relative ${activeTabId && activeTabId !== 'folium-graph' ? 'block' : 'hidden'}`}>
                    <div
                        className="absolute inset-0 flex bg-folium-bg dark:bg-folium-dark-bg"
                        ref={splitHostRef}
                    >
                        <div
                            className={`relative min-w-0 ${hasSplitPane ? 'flex-shrink-0' : 'flex-1'}`}
                            style={hasSplitPane ? { width: mainPaneWidth, flexBasis: mainPaneWidth } : undefined}
                            onMouseDown={() => onFocusPane?.('main')}
                        >
                            {editorNode}
                        </div>
                        {hasSplitPane && (
                            <div
                                className="relative min-w-0 flex-shrink-0 group/split-pane"
                                style={{ width: splitPaneWidth, flexBasis: splitPaneWidth }}
                                onMouseDown={() => onFocusPane?.('split')}
                            >
                                <div
                                    role="separator"
                                    aria-orientation="vertical"
                                    aria-label="Resize split panes"
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        updateSplitRatioFromClientX(event.clientX);
                                        setIsResizingSplit(true);
                                    }}
                                    className="absolute left-0 top-0 bottom-0 -translate-x-1/2 z-30 w-3 cursor-col-resize"
                                    title="Drag to resize panes"
                                >
                                    <div className={`absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px transition-colors ${isResizingSplit ? 'bg-folium-accent/80 dark:bg-folium-dark-accent/80' : 'bg-folium-border/70 dark:bg-folium-dark-border/80'}`} />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onCloseSplit?.()}
                                    className="absolute top-3 left-2 z-20 w-6 h-6 rounded-md border border-folium-border/60 dark:border-folium-dark-border/70 bg-folium-bg/90 dark:bg-folium-dark-bg/90 text-folium-text-secondary dark:text-folium-dark-text-secondary hover:text-folium-text dark:hover:text-folium-dark-text hover:bg-folium-bg dark:hover:bg-folium-dark-bg transition-all opacity-0 pointer-events-none group-hover/split-pane:opacity-100 group-hover/split-pane:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
                                    title="Close split pane"
                                >
                                    <svg className="w-3.5 h-3.5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                                <div className="absolute inset-0">
                                    {splitEditorNode}
                                </div>
                            </div>
                        )}
                    </div>
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