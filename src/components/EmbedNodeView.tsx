import { NodeViewWrapper } from '@tiptap/react'
import { FileSymlink } from 'lucide-react'

export default function EmbedNodeView(props: any) {
    const { node } = props
    const noteName = node.attrs.noteName || ''
    const anchor = node.attrs.anchor || ''

    return (
        <NodeViewWrapper
            className="my-4 border border-folio-border dark:border-folio-dark-border rounded-lg bg-folio-bg-secondary/30 overflow-hidden"
            data-type="embed"
            data-note-name={noteName}
            data-anchor={anchor}
        >
            <div className="flex items-center gap-2 px-3 py-2 bg-folio-bg-secondary/50 border-b border-folio-border dark:border-folio-dark-border" contentEditable={false}>
                <FileSymlink size={16} className="text-folio-accent dark:text-folio-dark-accent" />
                <span className="font-semibold text-sm opacity-80">{noteName}{anchor}</span>
                <span className="text-xs opacity-50 ml-auto uppercase tracking-wider">Embed</span>
            </div>
            <div className="p-4 text-center text-sm opacity-50 italic" contentEditable={false}>
                Note transclusion preview not yet available.
            </div>
        </NodeViewWrapper>
    )
}
