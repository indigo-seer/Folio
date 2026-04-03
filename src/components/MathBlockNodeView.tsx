import { NodeViewWrapper } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import 'katex/dist/katex.min.css'

export default function MathBlockNodeView(props: any) {
    const { node, updateAttributes } = props
    const [isEditing, setIsEditing] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)

    // Parse the raw latex from node attributes
    const rawMath = node.attrs.latex || ''

    useEffect(() => {
        if (!isEditing && contentRef.current) {
            import('katex').then((katexModule) => {
                const katex = katexModule.default || katexModule
                try {
                    katex.render(rawMath, contentRef.current!, {
                        displayMode: true,
                        throwOnError: false,
                    })
                } catch (e) {
                    contentRef.current!.innerText = rawMath
                }
            }).catch(() => {
                contentRef.current!.innerText = rawMath
            })
        }
    }, [isEditing, rawMath])

    return (
        <NodeViewWrapper className="my-4 relative group" data-type="math-block">
            {isEditing ? (
                <div key="editor" className="border border-folium-accent dark:border-folium-dark-accent rounded-md p-0 bg-folium-bg dark:bg-folium-dark-bg font-mono text-sm relative flex flex-col">
                    <div className="w-full flex justify-between items-center bg-folium-bg-secondary px-3 py-1 rounded-t-md border-b border-folium-border dark:border-folium-dark-border">
                        <span className="text-xs opacity-60">LaTeX Formula</span>
                        <button
                            className="bg-folium-accent text-white text-xs px-3 py-1 rounded hover:opacity-90"
                            onClick={() => setIsEditing(false)}
                            contentEditable={false}
                        >
                            Render
                        </button>
                    </div>
                    <textarea
                        className="w-full bg-transparent outline-none p-3 min-h-[5rem] resize-y font-mono text-sm"
                        value={rawMath}
                        onChange={(e) => updateAttributes({ latex: e.target.value })}
                        placeholder="Type LaTeX here..."
                        autoFocus
                    />
                </div>
            ) : (
                <div
                    key="viewer"
                    className="p-4 border border-transparent group-hover:border-folium-border dark:group-hover:border-folium-dark-border rounded-md cursor-pointer text-center overflow-x-auto min-h-[3rem] bg-folium-bg-secondary/20 transition-all"
                    onClick={() => setIsEditing(true)}
                    contentEditable={false}
                >
                    <div ref={contentRef} className="select-text katex-display-container">
                        {!rawMath && <span className="opacity-50 italic">Empty LaTeX block. Click to edit.</span>}
                    </div>
                </div>
            )}
        </NodeViewWrapper>
    )
}
