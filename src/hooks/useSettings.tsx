import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { FoliumConfig, UIConfig, saveConfig, loadConfig } from '../lib/config'

interface SettingsContextValue {
    theme: UIConfig['theme']
    fontSize: UIConfig['fontSize']
    typewriterBlur: boolean
    setTheme: (theme: UIConfig['theme']) => void
    setFontSize: (size: UIConfig['fontSize']) => void
    setTypewriterBlur: (enabled: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    // Local ephemeral states for immediate UI reactivity
    const [theme, setThemeState] = useState<UIConfig['theme']>('system')
    const [fontSize, setFontSizeState] = useState<UIConfig['fontSize']>('default')
    const [typewriterBlur, setTypewriterBlurState] = useState<boolean>(true)
    const [configRef, setConfigRef] = useState<FoliumConfig | null>(null)

    // First boot fetch - loads from disk or memory based on platform
    useEffect(() => {
        let mounted = true
        loadConfig().then(config => {
            if (mounted) {
                setConfigRef(config)
                setThemeState(config.ui.theme || 'system')
                setFontSizeState(config.ui.fontSize || 'default')
                setTypewriterBlurState(config.ui.typewriterBlur ?? true)
            }
        })
        return () => { mounted = false }
    }, [])

    // Debounced Config Saver mapped to local state changes
    useEffect(() => {
        if (!configRef) return

        // Fast UI diff check to avoid unnecessary I/O
        let changed = false
        const newConfig = { ...configRef }

        if (newConfig.ui.theme !== theme) { newConfig.ui.theme = theme; changed = true; }
        if (newConfig.ui.fontSize !== fontSize) { newConfig.ui.fontSize = fontSize; changed = true; }
        if (newConfig.ui.typewriterBlur !== typewriterBlur) { newConfig.ui.typewriterBlur = typewriterBlur; changed = true; }

        if (changed) {
            setConfigRef(newConfig)
            saveConfig(newConfig).catch(console.error)
        }
    }, [theme, fontSize, typewriterBlur, configRef])

    // Apply exact visual changes out-of-band to DOM (e.g tailwind dark mode, font sizing on html/body bounds)
    useEffect(() => {
        const root = document.documentElement
        let isDark = theme === 'dark'
        if (theme === 'system') {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        }

        if (isDark) {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }

        // Apply dynamic font sizing
        switch (fontSize) {
            case 'compact':
                root.style.setProperty('--folium-font-size', '15px')
                break
            case 'relaxed':
                root.style.setProperty('--folium-font-size', '20px')
                break
            case 'default':
            default:
                root.style.setProperty('--folium-font-size', '17px')
                break
        }
    }, [theme, fontSize])

    // Expose granular setter methods
    const setTheme = useCallback((t: UIConfig['theme']) => setThemeState(t), [])
    const setFontSize = useCallback((s: UIConfig['fontSize']) => setFontSizeState(s), [])
    const setTypewriterBlur = useCallback((b: boolean) => setTypewriterBlurState(b), [])

    return (
        <SettingsContext.Provider value={{
            theme,
            fontSize,
            typewriterBlur,
            setTheme,
            setFontSize,
            setTypewriterBlur
        }}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
