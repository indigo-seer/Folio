import { useState, useCallback, useMemo } from 'react'

export type TabType = 'markdown' | 'graph' | 'whiteboard' | 'unknown'
type Pane = 'main' | 'split'

export interface TabData {
    id: string; // unique identifier
    type: TabType;
    title: string;
    path?: string; // if it's a file
}

interface TabsState {
    tabById: Record<string, TabData>
    mainTabIds: string[]
    splitTabIds: string[]
    activeTabId: string | null
    splitTabId: string | null
}

const initialState: TabsState = {
    tabById: {},
    mainTabIds: [],
    splitTabIds: [],
    activeTabId: null,
    splitTabId: null,
}

function uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids))
}

function removeId(ids: string[], id: string): string[] {
    return ids.filter(tabId => tabId !== id)
}

function upsertTab(tabById: Record<string, TabData>, tab: TabData): Record<string, TabData> {
    return {
        ...tabById,
        [tab.id]: tabById[tab.id] ? { ...tabById[tab.id], ...tab } : tab
    }
}

function nextActiveAfterClose(prevIds: string[], nextIds: string[], removedId: string, currentActive: string | null): string | null {
    if (currentActive !== removedId) {
        return currentActive && nextIds.includes(currentActive) ? currentActive : (nextIds[0] ?? null)
    }

    const prevIndex = prevIds.indexOf(removedId)
    if (nextIds.length === 0) return null
    const fallbackIndex = Math.max(0, prevIndex - 1)
    return nextIds[fallbackIndex] ?? nextIds[0] ?? null
}

function cleanupUnusedTabs(state: TabsState): TabsState {
    const usedIds = new Set([...state.mainTabIds, ...state.splitTabIds])
    const nextTabById: Record<string, TabData> = {}

    usedIds.forEach(id => {
        const tab = state.tabById[id]
        if (tab) nextTabById[id] = tab
    })

    return {
        ...state,
        tabById: nextTabById,
    }
}

function setActiveForPane(prev: TabsState, pane: Pane, id: string | null): TabsState {
    if (id === null) {
        return pane === 'main'
            ? { ...prev, activeTabId: null }
            : { ...prev, splitTabId: null }
    }

    const tab = prev.tabById[id]
    if (!tab) return prev

    if (pane === 'main') {
        const mainTabIds = prev.mainTabIds.includes(id) ? prev.mainTabIds : [...prev.mainTabIds, id]
        return { ...prev, mainTabIds, activeTabId: id }
    }

    const splitTabIds = prev.splitTabIds.includes(id) ? prev.splitTabIds : [...prev.splitTabIds, id]
    return { ...prev, splitTabIds, splitTabId: id }
}

function closeTabInPaneState(prev: TabsState, pane: Pane, id: string): TabsState {
    if (pane === 'main') {
        const nextMainTabIds = removeId(prev.mainTabIds, id)
        let nextState: TabsState = {
            ...prev,
            mainTabIds: nextMainTabIds,
            activeTabId: nextActiveAfterClose(prev.mainTabIds, nextMainTabIds, id, prev.activeTabId),
        }

        // Maintain a usable main pane if split tabs still exist.
        if (!nextState.activeTabId && nextState.splitTabIds.length > 0) {
            const promotedId = nextState.splitTabId || nextState.splitTabIds[0]
            if (promotedId) {
                nextState = {
                    ...nextState,
                    mainTabIds: uniqueIds([...nextState.mainTabIds, promotedId]),
                    activeTabId: promotedId,
                }
            }
        }

        return cleanupUnusedTabs(nextState)
    }

    const nextSplitTabIds = removeId(prev.splitTabIds, id)
    const nextSplitActive = nextActiveAfterClose(prev.splitTabIds, nextSplitTabIds, id, prev.splitTabId)
    const nextState: TabsState = {
        ...prev,
        splitTabIds: nextSplitTabIds,
        splitTabId: nextSplitTabIds.length > 0 ? nextSplitActive : null,
    }

    return cleanupUnusedTabs(nextState)
}

export function useTabs() {
    const [state, setState] = useState<TabsState>(initialState)

    const openTab = useCallback((tab: TabData) => {
        setState(prev => {
            const tabById = upsertTab(prev.tabById, tab)
            const mainTabIds = prev.mainTabIds.includes(tab.id) ? prev.mainTabIds : [...prev.mainTabIds, tab.id]

            return {
                ...prev,
                tabById,
                mainTabIds,
                activeTabId: tab.id,
            }
        })
    }, [])

    const openTabInSplit = useCallback((tab: TabData) => {
        setState(prev => {
            const tabById = upsertTab(prev.tabById, tab)
            const splitTabIds = prev.splitTabIds.includes(tab.id) ? prev.splitTabIds : [...prev.splitTabIds, tab.id]

            return {
                ...prev,
                tabById,
                splitTabIds,
                splitTabId: tab.id,
                activeTabId: prev.activeTabId ?? tab.id,
                mainTabIds: prev.activeTabId ? prev.mainTabIds : uniqueIds([...prev.mainTabIds, tab.id]),
            }
        })
    }, [])

    const closeTabInPane = useCallback((pane: Pane, id: string) => {
        setState(prev => closeTabInPaneState(prev, pane, id))
    }, [])

    const closeTab = useCallback((id: string) => {
        setState(prev => {
            const afterMainClose = closeTabInPaneState(prev, 'main', id)
            const afterBothClose = closeTabInPaneState(afterMainClose, 'split', id)
            return cleanupUnusedTabs(afterBothClose)
        })
    }, [])

    const setActiveTabId = useCallback((id: string | null) => {
        setState(prev => setActiveForPane(prev, 'main', id))
    }, [])

    const setSplitTabId = useCallback((id: string | null) => {
        setState(prev => setActiveForPane(prev, 'split', id))
    }, [])

    const closeSplitTab = useCallback(() => {
        setState(prev => cleanupUnusedTabs({
            ...prev,
            splitTabIds: [],
            splitTabId: null,
        }))
    }, [])

    const renameTab = useCallback((oldId: string, newId: string, newTitle: string) => {
        setState(prev => {
            const oldTab = prev.tabById[oldId]
            if (!oldTab) return prev

            const nextTabById = { ...prev.tabById }
            delete nextTabById[oldId]
            nextTabById[newId] = { ...oldTab, id: newId, title: newTitle, path: newId }

            const remap = (ids: string[]) => uniqueIds(ids.map(id => (id === oldId ? newId : id)))

            const nextState: TabsState = {
                ...prev,
                tabById: nextTabById,
                mainTabIds: remap(prev.mainTabIds),
                splitTabIds: remap(prev.splitTabIds),
                activeTabId: prev.activeTabId === oldId ? newId : prev.activeTabId,
                splitTabId: prev.splitTabId === oldId ? newId : prev.splitTabId,
            }

            return cleanupUnusedTabs(nextState)
        })
    }, [])

    const clearTabs = useCallback(() => {
        setState(initialState)
    }, [])

    const mainTabs = useMemo(
        () => state.mainTabIds.map(id => state.tabById[id]).filter(Boolean),
        [state.mainTabIds, state.tabById]
    )

    const splitTabs = useMemo(
        () => state.splitTabIds.map(id => state.tabById[id]).filter(Boolean),
        [state.splitTabIds, state.tabById]
    )

    const tabs = useMemo(() => {
        const orderedIds = uniqueIds([...state.mainTabIds, ...state.splitTabIds])
        return orderedIds.map(id => state.tabById[id]).filter(Boolean)
    }, [state.mainTabIds, state.splitTabIds, state.tabById])

    return {
        tabs,
        mainTabs,
        splitTabs,
        activeTabId: state.activeTabId,
        splitTabId: state.splitTabId,
        setActiveTabId,
        setSplitTabId,
        openTab,
        openTabInSplit,
        closeTabInPane,
        closeTab,
        closeSplitTab,
        renameTab,
        clearTabs
    }
}

/**
 * Type of the object returned by `useTabs`.
 * Use this instead of `any` at every consumer boundary.
 */
export type TabsAPI = ReturnType<typeof useTabs>
