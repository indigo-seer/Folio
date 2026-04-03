import { useState, useEffect } from 'react'
import { FloatingBacklinks } from './FloatingBacklinks'
import { useWordCount } from '../hooks/useWordCount'

interface StatusBarProps {
    activeFileName?: string
    isTypewriterMode?: boolean
    onToggleTypewriter?: () => void
    isFocusMode?: boolean
    onToggleFocusMode?: () => void
}

export function StatusBar({ activeFileName, isTypewriterMode, onToggleTypewriter, isFocusMode, onToggleFocusMode }: StatusBarProps) {
    const { words, readingTime } = useWordCount();
    const [time, setTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="status-bar">
            <div className="flex items-center gap-4">
                <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
                <span className="opacity-40">·</span>
                <span>{readingTime}</span>
            </div>
            <div className="flex items-center gap-3 opacity-60 font-mono text-[12px]">
                {onToggleTypewriter && (
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onToggleTypewriter}
                        className={`hover:text-folium-accent transition-colors flex items-center gap-1 ${isTypewriterMode ? 'text-folium-accent opacity-100' : ''}`}
                        title="Toggle Typewriter Mode"
                    >
                        <i className={`ri-focus-3-line ${isTypewriterMode ? 'font-bold' : ''}`}></i>
                        <span className="hidden sm:inline">{isTypewriterMode ? 'Typewriter On' : 'Typewriter Off'}</span>
                    </button>
                )}
                {onToggleFocusMode && (
                    <>
                        <span className="opacity-40 select-none">|</span>
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onToggleFocusMode}
                            className={`hover:text-folium-accent transition-colors flex items-center gap-1 ${isFocusMode ? 'text-folium-accent opacity-100' : ''}`}
                            title="Toggle Focus Mode"
                        >
                            <i className={`ri-fullscreen-line ${isFocusMode ? 'font-bold' : ''}`}></i>
                            <span className="hidden sm:inline">{isFocusMode ? 'Focus On' : 'Focus Off'}</span>
                        </button>
                    </>
                )}
                <span className="opacity-40 select-none">|</span>
                {activeFileName && <FloatingBacklinks activeFileName={activeFileName} />}
                <span className="opacity-40 select-none hidden sm:inline">|</span>
                <span className="hidden sm:inline">{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
            </div>
        </div>
    )
}
