import { useContext, useState, useRef, useEffect } from 'react'
import { VaultContext } from '../contexts/VaultContext'

interface FloatingBacklinksProps {
    activeFileName: string
}

export function FloatingBacklinks({ activeFileName }: FloatingBacklinksProps) {
    const { backlinkIndex, onWikilinkClick } = useContext(VaultContext)
    const [isOpen, setIsOpen] = useState(false)
    const popoverRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    const backlinks = backlinkIndex.get(activeFileName)

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const backlinkCount = backlinks?.size || 0
    const backlinkArray = backlinks ? Array.from(backlinks).sort((a, b) => a.localeCompare(b)) : []

    return (
        <div className="relative flex items-center">
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`p-1 rounded-md transition-colors ${isOpen
                    ? 'bg-folio-border dark:bg-folio-dark-border text-folio-text dark:text-folio-dark-text'
                    : 'text-folio-text-tertiary dark:text-folio-dark-text-tertiary hover:bg-folio-border/50 dark:hover:bg-folio-dark-border/50 hover:text-folio-text dark:hover:text-folio-dark-text'
                    }`}
                title={backlinkCount === 0 ? 'No backlinks' : `${backlinkCount} backlink${backlinkCount === 1 ? '' : 's'}`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
            </button>

            {isOpen && (
                <div
                    ref={popoverRef}
                    // Positioned above the status bar icon, aligned to the right-ish
                    className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-folio-dark-bg border border-folio-border dark:border-folio-dark-border rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
                >
                    <div className="px-4 py-3 border-b border-folio-border/50 dark:border-folio-dark-border/50 text-base font-serif font-medium text-folio-text dark:text-folio-dark-text bg-folio-bg dark:bg-folio-dark-bg">
                        {backlinkCount === 0 ? 'No backlinks to this note' : `${backlinkCount} backlink${backlinkCount === 1 ? '' : 's'} to this note`}
                    </div>
                    {backlinkCount > 0 ? (
                        <div className="flex flex-col gap-0.5 overflow-y-auto max-h-64 p-1 custom-scrollbar">
                            {backlinkArray.map((noteName) => (
                                <button
                                    key={noteName}
                                    onClick={() => {
                                        onWikilinkClick(noteName)
                                        setIsOpen(false)
                                    }}
                                    className="text-left py-2 px-3 rounded text-sm font-sans font-medium text-folio-accent dark:text-folio-dark-accent underline decoration-1 underline-offset-4 hover:text-folio-accent-hover dark:hover:text-folio-dark-accent-hover hover:bg-folio-bg-secondary dark:hover:bg-folio-dark-bg-secondary transition-colors truncate"
                                >
                                    {noteName}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-sm font-sans text-folio-text dark:text-folio-dark-text">
                            Links to this note will appear here
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
