import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useSettings } from '../hooks/useSettings'

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
    const { focusModeDefault, typewriterModeDefault, isLoaded } = useSettings()
    const initializedRef = useRef(false)

    useEffect(() => {
        if (!isLoaded || initializedRef.current) return
        initializedRef.current = true
        setIsFocusMode(focusModeDefault)
        setIsTypewriterMode(typewriterModeDefault)
    }, [focusModeDefault, typewriterModeDefault, isLoaded])

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
