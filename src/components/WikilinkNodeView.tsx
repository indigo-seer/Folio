import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { useContext } from 'react'
import { VaultContext } from '../contexts/VaultContext'

export default function WikilinkNodeView(props: NodeViewProps) {
    const { notes, onWikilinkClick } = useContext(VaultContext)
    const noteName = props.node.attrs.noteName

    // It's a stub if the note doesn't exist in our global vault notes Set
    const isStub = !notes.has(noteName)

    return (
        <NodeViewWrapper
            as="span"
            className={`cursor-pointer underline decoration-1 underline-offset-4 font-medium transition-colors ${isStub
                    ? 'text-folio-text-tertiary dark:text-folio-dark-text-tertiary decoration-dashed hover:text-folio-text-secondary dark:hover:text-folio-dark-text-secondary'
                    : 'text-folio-accent dark:text-folio-dark-accent hover:text-blue-600 dark:hover:text-blue-400'
                }`}
            onClick={() => onWikilinkClick(noteName)}
        >
            {noteName}
        </NodeViewWrapper>
    )
}
