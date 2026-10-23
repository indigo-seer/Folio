import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { UIConfig, updateConfig, loadConfig } from '../lib/config'

interface SettingsContextValue {
    theme: UIConfig['theme']
    fontSize: UIConfig['fontSize']
    typewriterBlur: boolean
    focusModeDefault: boolean
    typewriterModeDefault: boolean
    isDark: boolean
    isLoaded: boolean
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
    const [focusModeDefault, setFocusModeDefault] = useState(false)
    const [typewriterModeDefault, setTypewriterModeDefault] = useState(false)
    const [isDark, setIsDark] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)
    const hasLoadedRef = useRef(false)

    // First boot fetch - loads from disk or memory based on platform
    useEffect(() => {
        let mounted = true
        loadConfig().then(config => {
            if (mounted) {
                hasLoadedRef.current = true
                setThemeState(config.ui.theme || 'system')
                setFontSizeState(config.ui.fontSize || 'default')
                setTypewriterBlurState(config.ui.typewriterBlur ?? true)
                setFocusModeDefault(config.ui.focusModeDefault ?? false)
                setTypewriterModeDefault(config.ui.typewriterModeDefault ?? false)
                setIsLoaded(true)
            }
        })
        return () => { mounted = false }
    }, [])

    // Debounced Config Saver mapped to local state changes
    useEffect(() => {
        if (!hasLoadedRef.current) return
        const timer = setTimeout(() => {
            void updateConfig(config => {
                config.ui = { ...config.ui, theme, fontSize, typewriterBlur }
            }).catch(error => console.error('Failed to save settings:', error))
        }, 150)
        return () => clearTimeout(timer)
    }, [theme, fontSize, typewriterBlur])


    // Apply exact visual changes out-of-band to DOM (e.g tailwind dark mode, font sizing on html/body bounds)
    useEffect(() => {
        const root = document.documentElement
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const applyTheme = () => {
            const nextIsDark = theme === 'dark' || (theme === 'system' && media.matches)
            setIsDark(nextIsDark)
            root.classList.toggle('dark', nextIsDark)
        }
        applyTheme()
        if (theme === 'system') media.addEventListener('change', applyTheme)

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
        return () => media.removeEventListener('change', applyTheme)
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
            focusModeDefault,
            typewriterModeDefault,
            isDark,
            isLoaded,
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
