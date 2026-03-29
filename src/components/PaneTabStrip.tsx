import { TabData } from '../hooks/useTabs'

interface PaneTabStripProps {
    tabs: TabData[]
    activeTabId: string | null
    isFocused: boolean
    onTabSelect: (id: string) => void
    onTabClose: (id: string) => void
    onPaneFocus?: () => void
}

export function PaneTabStrip({
    tabs,
    activeTabId,
    isFocused,
    onTabSelect,
    onTabClose,
    onPaneFocus
}: PaneTabStripProps) {
    return (
        <div
            className="h-[45px] border-b border-folio-border dark:border-folio-dark-border bg-folio-bg-secondary dark:bg-folio-dark-bg-secondary"
            onMouseDown={() => onPaneFocus?.()}
        >
            <div className="flex overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] h-full items-end px-2">
                {tabs.map(tab => {
                    const isActive = tab.id === activeTabId
                    return (
                        <div
                            key={tab.id}
                            onClick={() => onTabSelect(tab.id)}
                            className={`group relative flex justify-between items-center min-w-[120px] max-w-[220px] h-[38px] px-3 cursor-pointer transition-colors -mb-[1px] ${isActive
                                ? `bg-folio-bg dark:bg-folio-dark-bg text-folio-text dark:text-folio-dark-text border-t border-x rounded-t-lg z-10 ${isFocused
                                    ? 'border-folio-accent/70 dark:border-folio-dark-accent/70'
                                    : 'border-folio-border dark:border-folio-dark-border'
                                }`
                                : 'bg-transparent text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-folio-bg/50 dark:hover:bg-folio-dark-bg/50 border-t border-x border-transparent'
                                }`}
                            title={tab.path || tab.title}
                        >
                            {isActive && (
                                <span
                                    className={`absolute bottom-0 left-2 right-2 rounded-full ${isFocused
                                        ? 'h-[2px] bg-folio-accent dark:bg-folio-dark-accent'
                                        : 'h-px bg-folio-text-secondary/30 dark:bg-folio-dark-text-secondary/40'
                                        }`}
                                />
                            )}
                            <span className="truncate text-[13px] font-sans mr-2">{tab.title}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onTabClose(tab.id)
                                }}
                                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md hover:bg-folio-border dark:hover:bg-folio-dark-border opacity-0 group-hover:opacity-100 transition-opacity z-20"
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
        </div>
    )
}
