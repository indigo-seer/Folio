import { useState, useCallback } from 'react'

export type TabType = 'markdown' | 'graph' | 'whiteboard' | 'unknown'

export interface TabData {
    id: string; // unique identifier
    type: TabType;
    title: string;
    path?: string; // if it's a file
}

export function useTabs() {
    const [tabs, setTabs] = useState<TabData[]>([])
    const [activeTabId, setActiveTabId] = useState<string | null>(null)

    const openTab = useCallback((tab: TabData) => {
        setTabs(prev => {
            if (!prev.find(t => t.id === tab.id)) {
                return [...prev, tab]
            }
            return prev
        })
        setActiveTabId(tab.id)
    }, [])

    const closeTab = useCallback((id: string) => {
        setTabs(prev => {
            const index = prev.findIndex(t => t.id === id)
            if (index === -1) return prev

            const newTabs = [...prev]
            newTabs.splice(index, 1)

            setActiveTabId(currentActive => {
                if (currentActive === id) {
                    if (newTabs.length > 0) {
                        return newTabs[Math.max(0, index - 1)].id
                    }
                    return null
                }
                return currentActive
            })

            return newTabs
        })
    }, [])

    const renameTab = useCallback((oldId: string, newId: string, newTitle: string) => {
        setTabs(prev => prev.map(t => {
            if (t.id === oldId) {
                return { ...t, id: newId, title: newTitle, path: newId }
            }
            return t
        }))
        setActiveTabId(currentActive => (currentActive === oldId ? newId : currentActive))
    }, [])

    const clearTabs = useCallback(() => {
        setTabs([])
        setActiveTabId(null)
    }, [])

    return {
        tabs,
        activeTabId,
        setActiveTabId,
        openTab,
        closeTab,
        renameTab,
        clearTabs
    }
}
