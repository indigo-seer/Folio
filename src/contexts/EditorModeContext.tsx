import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

interface EditorModeContextValue {
    isFocusMode: boolean
    setIsFocusMode: Dispatch<SetStateAction<boolean>>
    isTypewriterMode: boolean
    setIsTypewriterMode: Dispatch<SetStateAction<boolean>>
}

const EditorModeContext = createContext<EditorModeContextValue | null>(null)

export function EditorModeProvider({ children }: { children: ReactNode }) {
    const [isFocusMode, setIsFocusMode] = useState(false)
    const [isTypewriterMode, setIsTypewriterMode] = useState(false)

    return (
        <EditorModeContext.Provider value={{ isFocusMode, setIsFocusMode, isTypewriterMode, setIsTypewriterMode }}>
            {children}
        </EditorModeContext.Provider>
    )
}

export function useEditorMode() {
    const context = useContext(EditorModeContext)
    if (!context) throw new Error('useEditorMode must be used within EditorModeProvider')
    return context
}
