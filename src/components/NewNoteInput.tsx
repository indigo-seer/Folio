import { useState, useRef, useEffect } from 'react'

const INVALID_CHARS = /[*"\\/<>:|?]/
const INVALID_CHARS_DISPLAY = '* " \\ / < > : | ?'

interface NewNoteInputProps {
    onSubmit: (name: string) => void
    onCancel: () => void
}

export function NewNoteInput({ onSubmit, onCancel }: NewNoteInputProps) {
    const [value, setValue] = useState('')
    const [error, setError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const validate = (name: string): string => {
        if (name.trim() === '') return 'Name cannot be empty'
        if (INVALID_CHARS.test(name)) return `Cannot contain: ${INVALID_CHARS_DISPLAY}`
        if (name.startsWith('.')) return 'Cannot start with a dot'
        if (name.length > 200) return 'Name too long'
        return ''
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        setValue(v)
        if (error) setError(validate(v))
    }

    const handleSubmit = () => {
        const err = validate(value)
        if (err) {
            setError(err)
            return
        }
        onSubmit(value.trim())
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
        } else if (e.key === 'Escape') {
            onCancel()
        }
    }

    return (
        <div className="px-2 py-1">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={onCancel}
                placeholder="Note name…"
                className={`
          w-full px-2 py-1 rounded-md font-sans text-ui
          outline-none border transition-colors duration-folium
          bg-folium-bg text-folium-text placeholder:text-folium-text-secondary/50
          dark:bg-folium-dark-bg dark:text-folium-dark-text dark:placeholder:text-folium-dark-text-secondary/50
          ${error
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-folium-accent/40 dark:border-folium-dark-accent/40'
                    }
        `}
            />
            {error && (
                <div className="mt-1 px-2 py-0.5 rounded text-[11px] font-sans
                        bg-red-500/90 text-white dark:bg-red-600/90">
                    {error}
                </div>
            )}
        </div>
    )
}
