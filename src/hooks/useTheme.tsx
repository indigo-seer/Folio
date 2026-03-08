import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'light',
    toggleTheme: () => { },
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem('folio-theme') as Theme | null
        if (stored) return stored
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    })

    useEffect(() => {
        const root = document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        localStorage.setItem('folio-theme', theme)
    }, [theme])

    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }, [])

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}
