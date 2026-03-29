import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { useContext } from 'react'
import { VaultContext } from '../contexts/VaultContext'

export default function WikilinkNodeView(props: NodeViewProps) {
    const { notes, onWikilinkClick } = useContext(VaultContext)
    const noteName = props.node.attrs.noteName || ''
    const anchor = props.node.attrs.anchor || ''
    const alias = props.node.attrs.alias || ''

    // Display text priority
    let displayText = alias || noteName
    if (!displayText && anchor) {
        displayText = anchor.replace(/^[#^]/, '')
    }

    // It's a same-note anchor if noteName is empty but anchor exists
    const isSameNoteAnchor = !noteName && !!anchor

    // It's a stub if the note doesn't exist in our global vault notes Set
    // Same-note anchors are never stubs (they reference the current note)
    const isStub = !isSameNoteAnchor && !!noteName && !notes.has(noteName)

    // Show a subtle anchor indicator when there's an anchor but no alias
    const showAnchorIcon = !!anchor && !alias

    const handleClick = () => {
        if (isSameNoteAnchor) {
            // For same-note anchors, we need to scroll within the current editor
            // Pass the anchor to the click handler which will handle scrolling
            onWikilinkClick(noteName, anchor)
        } else {
            onWikilinkClick(noteName, anchor)
        }
    }

    return (
        <NodeViewWrapper
            as="span"
            className={`cursor-pointer underline decoration-1 underline-offset-4 font-medium transition-colors ${isStub
                ? 'text-folio-text-tertiary dark:text-folio-dark-text-tertiary decoration-dashed hover:text-folio-text-secondary dark:hover:text-folio-dark-text-secondary'
                : 'text-folio-accent dark:text-folio-dark-accent hover:text-blue-600 dark:hover:text-blue-400'
                }`}
            onClick={handleClick}
        >
            {showAnchorIcon && <span className="opacity-50 mr-0.5">§</span>}
            {displayText}
        </NodeViewWrapper>
    )
}
