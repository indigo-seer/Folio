import { NodeViewWrapper } from '@tiptap/react'

export default function TagNodeView(props: any) {
    const { node } = props
    const text = node.attrs.text || ''

    return (
        <NodeViewWrapper
            as="span"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-folio-accent/10 text-folio-accent dark:bg-folio-dark-accent/20 dark:text-folio-dark-accent decoration-transparent"
            data-type="tag"
            data-tag={text}
        >
            <span className="opacity-60 mr-0.5">#</span>
            {text}
        </NodeViewWrapper>
    )
}
