import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface RenameModalProps {
    initialName: string
    isFolder?: boolean
    title?: string
    actionLabel?: string
    placeholder?: string
    onRename: (newName: string) => void
    onClose: () => void
}

export function RenameModal({ initialName, isFolder = false, title = 'Rename note', actionLabel = 'Rename', placeholder = 'Note name', onRename, onClose }: RenameModalProps) {
    const defaultName = isFolder ? initialName : initialName.replace(/\.md$/, '')
    const [name, setName] = useState(defaultName)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // Focus and select all text when opened
        if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = name.trim()
        const comp = isFolder ? initialName : initialName.replace(/\.md$/, '')
        if (trimmed && trimmed !== comp) {
            onRename(trimmed)
        }
        onClose()
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onMouseDown={onClose}
        >
            <div
                className="bg-folio-bg dark:bg-folio-dark-bg border border-folio-border dark:border-folio-dark-border rounded-xl shadow-2xl p-6 w-full max-w-sm pointer-events-auto animate-in zoom-in-95 duration-200"
                onMouseDown={(e) => e.stopPropagation()} // Prevent clicks from bleeding through
            >
                <h3 className="font-serif text-lg text-folio-text dark:text-folio-dark-text font-medium mb-4">{title}</h3>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-folio-dark-bg-secondary border border-folio-border dark:border-folio-dark-border rounded-lg text-folio-text dark:text-folio-dark-text font-sans text-sm focus:outline-none focus:ring-2 focus:ring-folio-accent dark:focus:ring-folio-dark-accent mb-6"
                        placeholder={placeholder}
                    />

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 font-sans text-sm font-medium text-folio-text-secondary dark:text-folio-dark-text-secondary hover:bg-folio-border/50 dark:hover:bg-folio-dark-border/50 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="px-4 py-2 font-sans text-sm font-medium bg-folio-accent text-white dark:bg-folio-dark-accent hover:bg-folio-accent-hover dark:hover:bg-folio-dark-accent-hover rounded-lg transition-colors disabled:opacity-50"
                        >
                            {actionLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
