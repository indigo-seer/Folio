import { TabData } from '../hooks/useTabs'
import { needsCustomWindowControls, isMacOS, isTauri } from '../lib/platform'
import { WindowControls } from './WindowControls'

interface TabBarProps {
    tabs: TabData[];
    activeTabId: string | null;
    onTabSelect: (id: string) => void;
    onTabClose: (id: string) => void;
    sidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    theme: string;
    onToggleTheme: () => void;
}

export function TabBar({
    tabs,
    activeTabId,
    onTabSelect,
    onTabClose,
    sidebarCollapsed,
    onToggleSidebar,
    theme,
    onToggleTheme
}: TabBarProps) {
    return (
        <div
            className="flex items-end justify-between bg-folio-bg-secondary dark:bg-folio-dark-bg-secondary select-none h-[45px] border-b border-folio-border dark:border-folio-dark-border w-full"
            style={{
                WebkitAppRegion: 'drag',
                paddingLeft: isTauri() && isMacOS() ? '80px' : undefined,
            } as React.CSSProperties}
            onDoubleClick={async () => {
                if (needsCustomWindowControls()) {
                    const { getCurrentWindow } = await import('@tauri-apps/api/window')
                    await getCurrentWindow().toggleMaximize()
                }
            }}
        >
            {/* Left side: sidebar toggle + tabs */}
            <div className={`flex overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-1 h-full items-end ${sidebarCollapsed ? 'pl-2' : '-ml-[1px]'}`}>
                {sidebarCollapsed && (
                    <div className="flex items-center h-[38px] px-2 border-r border-folio-border dark:border-folio-dark-border mr-2 mb-[1px]">
                        <button
                            onClick={onToggleSidebar}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-folio-text-secondary hover:text-folio-text dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text transition-colors duration-folio"
                            title="Open sidebar"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {tabs.map(tab => {
                    const isActive = tab.id === activeTabId
                    return (
                        <div
                            key={tab.id}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            onClick={() => onTabSelect(tab.id)}
                            className={`group relative flex justify-between items-center min-w-[120px] max-w-[200px] h-[38px] px-3 cursor-pointer transition-colors -mb-[1px] ${isActive
                                ? 'bg-folio-bg dark:bg-folio-dark-bg text-folio-text dark:text-folio-dark-text border-t border-x border-folio-border dark:border-folio-dark-border rounded-t-lg z-10 before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[2px] before:bg-blue-500 dark:before:bg-[#3b82f6]'
                                : 'bg-transparent text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-folio-bg/50 dark:hover:bg-folio-dark-bg/50 border-t border-x border-transparent after:absolute after:right-0 after:top-[20%] after:bottom-[20%] after:w-[1px] after:bg-folio-border dark:after:bg-folio-dark-border'
                                }`}
                            title={tab.path || tab.title}
                        >
                            <span className="truncate text-[13px] font-sans mr-2">
                                {tab.title}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onTabClose(tab.id)
                                }}
                                className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md hover:bg-folio-border dark:hover:bg-folio-dark-border opacity-0 group-hover:opacity-100 transition-opacity z-20`}
                                title="Close tab"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* Right side: theme toggle */}
            <div className={`flex items-center h-[38px] flex-shrink-0 mb-[3px] ${needsCustomWindowControls() ? 'mr-2' : 'mr-4'}`}>
                <button
                    onClick={onToggleTheme}
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-folio-text-secondary hover:text-folio-text hover:bg-folio-bg/80 dark:text-folio-dark-text-secondary dark:hover:text-folio-dark-text dark:hover:bg-folio-dark-bg/80 transition-all duration-folio"
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Window controls — only shown on Windows and Linux */}
            {needsCustomWindowControls() && <WindowControls />}
        </div>
    )
}
