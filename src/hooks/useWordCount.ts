import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

export interface WordCountData {
    words: number
    characters: number
    readingTime: string
}

const debounceTimers = new WeakMap<Editor, ReturnType<typeof setTimeout>>()

export function updateWordCountGlobally(editor: Editor) {
    const existingTimer = debounceTimers.get(editor)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
        const text = editor.getText()
        const trimmed = text.trim()
        const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
        const characters = text.length
        const minutes = Math.max(1, Math.ceil(words / 200))
        const readingTime = words === 0 ? '0 min' : `${minutes} min read`

        window.dispatchEvent(new CustomEvent('folium:word-count', {
            detail: { words, characters, readingTime }
        }))
    }, 300)
    debounceTimers.set(editor, timer)
}

export function useWordCount() {
    const [stats, setStats] = useState<WordCountData>({
        words: 0,
        characters: 0,
        readingTime: '0 min',
    })

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<WordCountData>).detail
            setStats(detail)
        }

        window.addEventListener('folium:word-count', handler)
        return () => window.removeEventListener('folium:word-count', handler)
    }, [])

    return stats
}
