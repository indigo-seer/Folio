import { useState, useRef, useEffect, useCallback } from 'react'

const INVALID_CHARS = /[*"\\/<>:|?]/
const INVALID_CHARS_DISPLAY = '* " \\ / < > : | ?'

interface NoteTitleProps {
    title: string
    onRename: (newName: string) => Promise<void>
    autoFocus?: boolean
}

export function NoteTitle({ title, onRename, autoFocus }: NoteTitleProps) {
    const [value, setValue] = useState(title || '')
    const [error, setError] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const mountedRef = useRef(false)

    // Sync with prop when file changes
    useEffect(() => {
        setValue(title || '')
        setError('')
        setIsEditing(false)
    }, [title])

    // Track mount state to prevent blur firing during mount
    useEffect(() => {
        const timer = setTimeout(() => {
            mountedRef.current = true
        }, 100)
        return () => {
            clearTimeout(timer)
            mountedRef.current = false
        }
    }, [title]) // Reset on file change

    // Auto-focus for new notes
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            // Delay to let React finish rendering
            const timer = setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 50)
            return () => clearTimeout(timer)
        }
    }, [autoFocus])

    const validate = (name: string): string => {
        const trimmed = (name || '').trim()
        if (trimmed === '') return 'Name cannot be empty'
        if (INVALID_CHARS.test(trimmed)) return `Cannot contain: ${INVALID_CHARS_DISPLAY}`
        if (trimmed.startsWith('.')) return 'Cannot start with a dot'
        if (trimmed.length > 200) return 'Name too long'
        return ''
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        setValue(v)
        if (error) setError(validate(v))
    }

    const commitRename = useCallback(async () => {
        const trimmed = (value || '').trim()

        // If same as current title, just exit editing
        if (trimmed === (title || '').trim()) {
            setIsEditing(false)
            setError('')
            return
        }

        const err = validate(trimmed)
        if (err) {
            setError(err)
            return
        }

        try {
            await onRename(trimmed)
            setError('')
            setIsEditing(false)
        } catch (e) {
            setError((e as Error).message || 'Rename failed')
        }
    }, [value, title, onRename])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            commitRename()
        } else if (e.key === 'Escape') {
            setValue(title || '')
            setError('')
            setIsEditing(false)
            inputRef.current?.blur()
        }
    }

    return (
        <div className="max-w-prose-folio mx-auto px-6 pt-10 pb-2">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsEditing(true)}
                    onBlur={() => {
                        // Only commit if fully mounted (prevents race on file switch)
                        if (mountedRef.current && isEditing) {
                            commitRename()
                        }
                    }}
                    placeholder="Untitled"
                    className={`
            w-full bg-transparent outline-none
            font-serif note-title
            text-folio-text dark:text-folio-dark-text
            placeholder:text-folio-text-secondary/30 dark:placeholder:text-folio-dark-text-secondary/30
            border-b-2 transition-colors duration-folio pb-1
            ${error
                            ? 'border-red-400 dark:border-red-500'
                            : isEditing
                                ? 'border-folio-accent/30 dark:border-folio-dark-accent/30'
                                : 'border-transparent'
                        }
          `}
                    spellCheck={false}
                />
                {error && (
                    <div className="absolute left-0 top-full mt-1 px-2 py-0.5 rounded text-[11px] font-sans
                          bg-red-500/90 text-white dark:bg-red-600/90 z-10">
                        {error}
                    </div>
                )}
            </div>
        </div>
    )
}
