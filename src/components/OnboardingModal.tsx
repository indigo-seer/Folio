import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'
import { UIConfig } from '../lib/config'
import { Folder, FolderPlus, Search, Link } from 'lucide-react'

interface OnboardingModalProps {
    onComplete: (mode: 'pick' | 'create') => void
}

// ============================================================
// Step Components
// ============================================================

function StepWelcome() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

    return (
        <div className={`flex flex-col items-center justify-center h-full px-8 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {/* Logo */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 654 654" className="w-16 h-16 text-folium-text dark:text-folium-dark-text fill-current mb-6">
                <path d="M585.24,0H68.76A68.75,68.75,0,0,0,0,68.76V585.24A68.75,68.75,0,0,0,68.76,654H585.24A68.75,68.75,0,0,0,654,585.24V68.76A68.75,68.75,0,0,0,585.24,0ZM44.46,585.24v-23.8H128.1a48.6,48.6,0,0,0,48.54-48.54V146.76A48.6,48.6,0,0,0,128.1,98.22H44.46V68.76a24.33,24.33,0,0,1,24.3-24.3H420V609.54H68.76A24.33,24.33,0,0,1,44.46,585.24Zm565.08,0a24.33,24.33,0,0,1-24.3,24.3H464.43V44.46H585.24a24.33,24.33,0,0,1,24.3,24.3Z" />
                <path d="M537.59,98.22a10.11,10.11,0,0,0-10.11,10.11V550.52a10.11,10.11,0,1,0,20.21,0V108.33A10.11,10.11,0,0,0,537.59,98.22Z" />
            </svg>

            <h1 className="font-serif text-[36px] font-bold text-folium-text dark:text-folium-dark-text mb-3">
                Folium
            </h1>

            <p className="font-sans text-[16px] text-folium-text-secondary dark:text-folium-dark-text-secondary text-center max-w-[380px] leading-relaxed mb-10">
                A distraction-free markdown editor.<br />
                Your notes stay as plain files on disk — readable by any app, yours completely.
            </p>

        </div>
    )
}

function StepTheme() {
    const { theme, setTheme } = useSettings()
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

    const themes: { key: UIConfig['theme']; label: string; desc: string; icon: React.ReactNode }[] = [
        {
            key: 'light',
            label: 'Light',
            desc: 'Clean & bright',
            icon: (
                <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border-2 border-[#E2DDD5] flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-[#F0EDE8]" />
                </div>
            ),
        },
        {
            key: 'dark',
            label: 'Dark',
            desc: 'Easy on the eyes',
            icon: (
                <div className="w-10 h-10 rounded-full bg-[#1A1B2E] border-2 border-[#2E3048] flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-[#232438]" />
                </div>
            ),
        },
        {
            key: 'system',
            label: 'System',
            desc: 'Match your OS',
            icon: (
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#E2DDD5] dark:border-[#2E3048] flex">
                    <div className="w-1/2 bg-[#FAF9F6]" />
                    <div className="w-1/2 bg-[#1A1B2E]" />
                </div>
            ),
        },
    ]

    return (
        <div className={`flex flex-col items-center justify-center h-full px-8 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="font-serif text-[28px] font-bold text-folium-text dark:text-folium-dark-text mb-2">
                Choose your look
            </h2>
            <p className="font-sans text-[15px] text-folium-text-secondary dark:text-folium-dark-text-secondary mb-8">
                You can change this anytime in Settings.
            </p>

            <div className="flex gap-4 mb-10">
                {themes.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTheme(t.key)}
                        className={`flex flex-col items-center p-5 rounded-xl border-2 transition-all duration-200 w-[130px] ${theme === t.key
                            ? 'border-folium-accent dark:border-folium-dark-accent bg-folium-accent/5 dark:bg-folium-dark-accent/10 shadow-md'
                            : 'border-folium-border dark:border-folium-dark-border bg-white dark:bg-folium-dark-bg-secondary hover:border-folium-text-secondary/30 dark:hover:border-folium-dark-text-secondary/30'
                            }`}
                    >
                        <div className="mb-3">{t.icon}</div>
                        <span className="font-sans text-[14px] font-semibold text-folium-text dark:text-folium-dark-text mb-0.5">
                            {t.label}
                        </span>
                        <span className="font-sans text-[12px] text-folium-text-secondary dark:text-folium-dark-text-secondary">
                            {t.desc}
                        </span>
                    </button>
                ))}
            </div>

        </div>
    )
}

function StepWritingModes() {
    const [focusMode, setFocusMode] = useState(false)
    const [typewriterMode, setTypewriterMode] = useState(false)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
        
        let isMounted = true;
        let step = 0;
        
        const runAnimation = () => {
            if (!isMounted) return;
            
            if (step === 0) {
                // Start with both off
                setFocusMode(false);
                setTypewriterMode(false);
                setTimeout(runAnimation, 2000);
            } else if (step === 1) {
                // Turn on focus mode
                setFocusMode(true);
                setTimeout(runAnimation, 2000);
            } else if (step === 2) {
                // Turn on typewriter mode
                setTypewriterMode(true);
                setTimeout(runAnimation, 2000);
            } else if (step === 3) {
                // Turn off both
                setFocusMode(false);
                setTypewriterMode(false);
                setTimeout(runAnimation, 2000);
            }
            step = (step + 1) % 4;
        };

        const timeout = setTimeout(runAnimation, 100);

        return () => {
            isMounted = false;
            clearTimeout(timeout);
        };
    }, [])

    const sampleLines = [
        { text: 'The rain had stopped by the time she reached', dim: true },
        { text: 'the edge of the old quarter. Puddles reflected', dim: true },
        { text: 'neon signs in languages she couldn\'t read—', dim: true },
        { text: '', dim: true },
        { text: 'but the café on the corner was still open,', active: true },
        { text: '', dim: true },
        { text: 'and through the fogged glass she could see', dim: true },
        { text: 'someone writing in a notebook, slowly,', dim: true },
        { text: 'as if the words themselves needed time to arrive.', dim: true },
    ]

    return (
        <div className={`flex flex-col items-center justify-center h-full px-8 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="font-serif text-[28px] font-bold text-folium-text dark:text-folium-dark-text mb-2">
                Deep Focus
            </h2>
            <p className="font-sans text-[15px] text-folium-text-secondary dark:text-folium-dark-text-secondary mb-6 text-center max-w-[400px]">
                Remove distractions with Focus Mode, and keep your eyes on the current line with Typewriter Mode. Perfect for long-form writing.
            </p>

            {/* Mini Editor Mockup */}
            <div className="w-full max-w-[480px] rounded-xl border border-folium-border dark:border-folium-dark-border bg-folium-bg dark:bg-folium-dark-bg shadow-lg overflow-hidden mb-5 relative">
                {/* Fake Tab Bar */}
                <div className={`flex items-center gap-2 px-3 py-2 border-b border-folium-border dark:border-folium-dark-border bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary transition-all duration-700 ${focusMode ? 'opacity-0 max-h-0 py-0 border-b-0 overflow-hidden' : 'opacity-100 max-h-12'}`}>
                    <div className="px-3 py-1 rounded text-[11px] font-sans font-medium text-folium-text dark:text-folium-dark-text bg-folium-bg dark:bg-folium-dark-bg border border-folium-border/50 dark:border-folium-dark-border">
                        Draft.md
                    </div>
                    <div className="px-3 py-1 rounded text-[11px] font-sans text-folium-text-secondary dark:text-folium-dark-text-secondary">
                        Notes.md
                    </div>
                </div>

                <div className="flex">
                    {/* Fake Sidebar */}
                    <div className={`flex flex-col gap-1.5 p-2 border-r border-folium-border dark:border-folium-dark-border bg-folium-bg-secondary dark:bg-folium-dark-bg-secondary transition-all duration-700 ${focusMode ? 'opacity-0 max-w-0 p-0 border-r-0 overflow-hidden' : 'opacity-100 max-w-[100px] min-w-[80px]'}`}>
                        <div className="h-2 w-12 rounded bg-folium-text-secondary/15 dark:bg-folium-dark-text-secondary/20" />
                        <div className="h-2 w-16 rounded bg-folium-accent/20 dark:bg-folium-dark-accent/20" />
                        <div className="h-2 w-10 rounded bg-folium-text-secondary/15 dark:bg-folium-dark-text-secondary/20" />
                        <div className="h-2 w-14 rounded bg-folium-text-secondary/15 dark:bg-folium-dark-text-secondary/20" />
                        <div className="h-2 w-9 rounded bg-folium-text-secondary/15 dark:bg-folium-dark-text-secondary/20" />
                    </div>

                    {/* Editor Content */}
                    <div className="flex-1 px-5 py-4 relative overflow-hidden" style={{ minHeight: '200px' }}>
                        <div className={`flex flex-col gap-[6px] transition-all duration-700 ${typewriterMode ? 'translate-y-[32px]' : 'translate-y-0'}`}>
                            {sampleLines.map((line, i) => (
                                <div
                                    key={i}
                                    className={`font-sans text-[13px] leading-relaxed transition-all duration-700 ${line.text === '' ? 'h-4' : ''
                                        } ${line.active
                                            ? 'text-folium-text dark:text-folium-dark-text font-medium'
                                            : typewriterMode
                                                ? 'text-folium-text-secondary/30 dark:text-folium-dark-text-secondary/25 blur-[1.5px]'
                                                : 'text-folium-text/80 dark:text-folium-dark-text/80'
                                        }`}
                                >
                                    {line.text}
                                    {line.active && (
                                        <span className="inline-block w-[2px] h-[14px] bg-folium-accent dark:bg-folium-dark-accent ml-0.5 animate-pulse align-middle" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Fake Status Bar */}
                <div className={`flex items-center justify-between px-3 py-1.5 border-t border-folium-border dark:border-folium-dark-border text-[10px] font-sans text-folium-text-secondary dark:text-folium-dark-text-secondary transition-all duration-700 ${focusMode ? 'opacity-0 max-h-0 py-0 border-t-0 overflow-hidden' : 'opacity-100 max-h-10'}`}>
                    <span>52 words · 1 min read</span>
                    <span>Typewriter</span>
                </div>
            </div>

            {/* Animation state text */}
            <div className="flex gap-6 mb-6 h-6 items-center">
                <span className={`font-sans text-[14px] font-medium transition-colors duration-300 ${focusMode ? 'text-folium-accent dark:text-folium-dark-accent' : 'text-folium-text-secondary/50 dark:text-folium-dark-text-secondary/50'}`}>
                    Focus Mode
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-folium-border dark:bg-folium-dark-border" />
                <span className={`font-sans text-[14px] font-medium transition-colors duration-300 ${typewriterMode ? 'text-folium-accent dark:text-folium-dark-accent' : 'text-folium-text-secondary/50 dark:text-folium-dark-text-secondary/50'}`}>
                    Typewriter Mode
                </span>
            </div>

        </div>
    )
}

function StepKeyboard() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

    return (
        <div className={`flex flex-col items-center justify-center h-full px-8 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="font-serif text-[28px] font-bold text-folium-text dark:text-folium-dark-text mb-2">
                Move at the speed of thought
            </h2>
            <p className="font-sans text-[15px] text-folium-text-secondary dark:text-folium-dark-text-secondary text-center max-w-[400px] mb-10">
                Folium is built for the keyboard. Keep your hands on the keys and let your ideas flow.
            </p>

            <div className="flex flex-col gap-4 w-full max-w-[420px] mb-10">
                <div className="flex items-start gap-4 p-5 rounded-xl border border-folium-border dark:border-folium-dark-border bg-white dark:bg-folium-dark-bg-secondary">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-folium-accent/10 dark:bg-folium-dark-accent/10 flex items-center justify-center text-folium-accent dark:text-folium-dark-accent mt-1">
                        <Search className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-sans text-[15px] font-semibold text-folium-text dark:text-folium-dark-text">Command Palette</h3>
                            <div className="flex gap-1">
                                <kbd className="px-2 py-1 rounded bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border text-[11px] font-mono font-medium text-folium-text dark:text-folium-dark-text shadow-sm">Ctrl</kbd>
                                <kbd className="px-2 py-1 rounded bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border text-[11px] font-mono font-medium text-folium-text dark:text-folium-dark-text shadow-sm">T</kbd>
                            </div>
                        </div>
                        <p className="font-sans text-[13.5px] text-folium-text-secondary dark:text-folium-dark-text-secondary leading-relaxed">
                            Open files, run commands, and navigate your workspace instantly without reaching for the mouse.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-xl border border-folium-border dark:border-folium-dark-border bg-white dark:bg-folium-dark-bg-secondary">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-folium-accent/10 dark:bg-folium-dark-accent/10 flex items-center justify-center text-folium-accent dark:text-folium-dark-accent mt-1">
                        <Link className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-sans text-[15px] font-semibold text-folium-text dark:text-folium-dark-text">Wiki Links</h3>
                            <div className="flex gap-1">
                                <kbd className="px-2 py-1 rounded bg-folium-bg dark:bg-folium-dark-bg border border-folium-border dark:border-folium-dark-border text-[11px] font-mono font-medium text-folium-text dark:text-folium-dark-text shadow-sm">[[</kbd>
                            </div>
                        </div>
                        <p className="font-sans text-[13.5px] text-folium-text-secondary dark:text-folium-dark-text-secondary leading-relaxed">
                            Type two brackets to quickly link to other notes or create new ones on the fly.
                        </p>
                    </div>
                </div>
            </div>

        </div>
    )
}

function StepWorkspace({ onComplete }: { onComplete: (mode: 'pick' | 'create') => void }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

    return (
        <div className={`flex flex-col items-center justify-center h-full px-8 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="font-serif text-[28px] font-bold text-folium-text dark:text-folium-dark-text mb-2">
                Open your workspace
            </h2>
            <p className="font-sans text-[15px] text-folium-text-secondary dark:text-folium-dark-text-secondary text-center max-w-[380px] leading-relaxed mb-8">
                A workspace is any folder on your computer. Pick one with existing notes or start with a fresh folder.
            </p>

            <div className="flex flex-col gap-3 w-full max-w-[360px]">
                <button
                    onClick={() => onComplete('pick')}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-folium-border dark:border-folium-dark-border bg-white dark:bg-folium-dark-bg-secondary hover:border-folium-accent dark:hover:border-folium-dark-accent transition-all duration-200 group"
                >
                    <div className="w-11 h-11 rounded-lg bg-folium-accent/10 dark:bg-folium-dark-accent/10 flex items-center justify-center text-folium-accent dark:text-folium-dark-accent group-hover:bg-folium-accent/20 dark:group-hover:bg-folium-dark-accent/20 transition-colors">
                        <Folder className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-sans text-[15px] font-semibold text-folium-text dark:text-folium-dark-text">
                            Choose a folder
                        </div>
                        <div className="font-sans text-[13px] text-folium-text-secondary dark:text-folium-dark-text-secondary">
                            Open an existing folder with your notes
                        </div>
                    </div>
                </button>

                <button
                    onClick={() => onComplete('create')}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-folium-border dark:border-folium-dark-border bg-white dark:bg-folium-dark-bg-secondary hover:border-folium-accent dark:hover:border-folium-dark-accent transition-all duration-200 group"
                >
                    <div className="w-11 h-11 rounded-lg bg-folium-accent/10 dark:bg-folium-dark-accent/10 flex items-center justify-center text-folium-accent dark:text-folium-dark-accent group-hover:bg-folium-accent/20 dark:group-hover:bg-folium-dark-accent/20 transition-colors">
                        <FolderPlus className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-sans text-[15px] font-semibold text-folium-text dark:text-folium-dark-text">
                            Start fresh
                        </div>
                        <div className="font-sans text-[13px] text-folium-text-secondary dark:text-folium-dark-text-secondary">
                            Create a new folder in Documents
                        </div>
                    </div>
                </button>
            </div>
        </div>
    )
}

// ============================================================
// Main Modal
// ============================================================

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
    const [step, setStep] = useState(0) // 0=welcome, 1=theme, 2=writing, 3=keyboard, 4=workspace
    const [transitioning, setTransitioning] = useState(false)

    const goNext = useCallback(() => {
        setTransitioning(true)
        setTimeout(() => {
            setStep(prev => prev + 1)
            setTransitioning(false)
        }, 300)
    }, [])

    const totalSteps = 5

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-folium-bg dark:bg-folium-dark-bg transition-colors duration-200">
            {/* Content Card */}
            <div className="w-full max-w-[600px] h-[620px] flex flex-col">
                {/* Step Content */}
                <div className={`flex-1 min-h-0 transition-opacity duration-300 ${transitioning ? 'opacity-0' : 'opacity-100'}`}>
                    {step === 0 && <StepWelcome />}
                    {step === 1 && <StepTheme />}
                    {step === 2 && <StepWritingModes />}
                    {step === 3 && <StepKeyboard />}
                    {step === 4 && <StepWorkspace onComplete={onComplete} />}
                </div>

            </div>

            {/* Global Controls - anchored to bottom of screen */}
            <div className="absolute bottom-12 left-0 w-full flex flex-col items-center gap-6">
                <div className={`transition-all duration-300 ${step === 4 ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100 translate-y-0'}`}>
                    <button
                        onClick={goNext}
                        className="px-8 py-3 rounded-lg font-sans text-[15px] font-medium text-white bg-folium-accent dark:bg-folium-dark-accent hover:bg-folium-accent-hover dark:hover:bg-folium-dark-accent-hover transition-colors duration-200 shadow-sm"
                    >
                        {step === 0 ? 'Get Started →' : 'Continue →'}
                    </button>
                </div>
                
                <div className="flex items-center justify-center gap-2">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <div
                            key={i}
                            className={`rounded-full transition-all duration-300 ${i === step
                                ? 'w-6 h-2 bg-folium-accent dark:bg-folium-dark-accent'
                                : i < step
                                    ? 'w-2 h-2 bg-folium-accent/40 dark:bg-folium-dark-accent/40'
                                    : 'w-2 h-2 bg-folium-border dark:bg-folium-dark-border'
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>,
        document.body
    )
}
