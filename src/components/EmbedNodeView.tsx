import { NodeViewWrapper } from '@tiptap/react'
import { FileSymlink } from 'lucide-react'
import { useContext, useEffect, useMemo, useState } from 'react'
import { VaultContext } from '../contexts/VaultContext'

function findNotePath(tree: any[], noteName: string): string | null {
    for (const node of tree) {
        if (node.kind === 'file' && node.name === `${noteName}.md`) {
            return node.path
        }
        if (node.kind === 'directory' && node.children) {
            const found = findNotePath(node.children, noteName)
            if (found) return found
        }
    }
    return null
}

function toPreviewText(markdown: string): string {
    const normalized = markdown.replace(/\r/g, '')
    const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '')
    const lines = withoutFrontmatter
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0)
        .slice(0, 8)

    return lines.join('\n').trim()
}

export default function EmbedNodeView(props: any) {
    const { node } = props
    const noteName = node.attrs.noteName || ''
    const anchor = node.attrs.anchor || ''
    const { vault, fileSystem, onWikilinkClick } = useContext(VaultContext)
    const notePath = useMemo(() => findNotePath(vault.tree, noteName), [vault.tree, noteName])
    const [previewText, setPreviewText] = useState('')
    const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

    useEffect(() => {
        let isCancelled = false

        const loadPreview = async () => {
            if (!noteName || !notePath) {
                setStatus('missing')
                setPreviewText('')
                return
            }

            setStatus('loading')

            try {
                const raw = await fileSystem.readFile(notePath)
                if (isCancelled) return
                const preview = toPreviewText(raw)
                setPreviewText(preview)
                setStatus('ready')
            } catch (error) {
                if (isCancelled) return
                console.error('Failed to load embed preview:', error)
                setStatus('error')
                setPreviewText('')
            }
        }

        loadPreview()
        return () => {
            isCancelled = true
        }
    }, [fileSystem, noteName, notePath])

    return (
        <NodeViewWrapper
            className="my-4 border border-folium-border dark:border-folium-dark-border rounded-lg bg-folium-bg-secondary/30 overflow-hidden"
            data-type="embed"
            data-note-name={noteName}
            data-anchor={anchor}
        >
            <button
                type="button"
                className="w-full text-left flex items-center gap-2 px-3 py-2 bg-folium-bg-secondary/50 border-b border-folium-border dark:border-folium-dark-border hover:bg-folium-bg-secondary/70 dark:hover:bg-folium-dark-bg-secondary/60 transition-colors"
                contentEditable={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                    if (noteName) onWikilinkClick(noteName, anchor || null)
                }}
                title={noteName ? `Open ${noteName}${anchor}` : 'Open note'}
            >
                <FileSymlink size={16} className="text-folium-accent dark:text-folium-dark-accent" />
                <span className="font-semibold text-sm opacity-80">{noteName}{anchor}</span>
                <span className="text-xs opacity-50 ml-auto uppercase tracking-wider">Embed</span>
            </button>
            <div className="p-4 text-sm opacity-80 whitespace-pre-wrap leading-relaxed" contentEditable={false}>
                {status === 'loading' && (
                    <span className="opacity-55 italic">Loading embed preview...</span>
                )}
                {status === 'missing' && (
                    <span className="opacity-55 italic">Target note was not found in this vault.</span>
                )}
                {status === 'error' && (
                    <span className="opacity-55 italic">Could not load this embed preview.</span>
                )}
                {status === 'ready' && (
                    <span>{previewText || 'This note is empty.'}</span>
                )}
            </div>
        </NodeViewWrapper>
    )
}
