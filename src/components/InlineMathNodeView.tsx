import { NodeViewWrapper } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import 'katex/dist/katex.min.css'

export default function InlineMathNodeView(props: any) {
    const { node, updateAttributes } = props
    const contentRef = useRef<HTMLSpanElement>(null)
    const [isEditing, setIsEditing] = useState(false)

    useEffect(() => {
        if (!isEditing && contentRef.current && node.attrs.math) {
            import('katex').then((katexModule) => {
                const katex = katexModule.default || katexModule
                try {
                    katex.render(node.attrs.math, contentRef.current!, {
                        displayMode: false,
                        throwOnError: false,
                    })
                } catch (e) {
                    contentRef.current!.innerText = `$${node.attrs.math}$`
                }
            }).catch(() => {
                contentRef.current!.innerText = `$${node.attrs.math}$`
            })
        }
    }, [isEditing, node.attrs.math])

    if (isEditing) {
        return (
            <NodeViewWrapper as="span" className="inline-block mx-1" data-type="inline-math">
                <input
                    className="bg-folio-bg-secondary text-folio-text px-1 rounded font-mono text-sm inline min-w-[30px] border border-folio-accent"
                    value={node.attrs.math}
                    onChange={(e) => updateAttributes({ math: e.target.value })}
                    onBlur={() => setIsEditing(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(false) }}
                    autoFocus
                />
            </NodeViewWrapper>
        )
    }

    return (
        <NodeViewWrapper as="span" className="mx-1" data-type="inline-math">
            <span
                ref={contentRef}
                className="katex-inline-container cursor-pointer hover:bg-folio-bg-secondary/50 rounded px-1 transition-colors"
                onClick={() => setIsEditing(true)}
            />
        </NodeViewWrapper>
    )
}
