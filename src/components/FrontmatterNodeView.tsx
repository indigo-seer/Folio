import { NodeViewWrapper } from '@tiptap/react'
import { FileSliders } from 'lucide-react'

export default function FrontmatterNodeView(props: any) {
    const { node, updateAttributes } = props
    const yaml = node.attrs.yaml || ''
    const isExpanded = node.attrs.expanded

    // Quick heuristic to count properties
    const propertyCount = yaml.split('\n').filter((l: string) => l.trim().length > 0 && l.includes(':')).length

    const toggleExpand = () => {
        updateAttributes({ expanded: !isExpanded })
    }

    return (
        <NodeViewWrapper
            className="my-4 font-mono text-sm border-l-2 border-folio-accent dark:border-folio-dark-accent bg-folio-bg-secondary dark:bg-folio-dark-bg-secondary rounded-r-md overflow-hidden"
            data-type="frontmatter"
            data-yaml={yaml}
            data-expanded={isExpanded ? '' : undefined}
        >
            <div
                className="flex items-center gap-2 px-4 py-2 text-folio-text dark:text-folio-dark-text opacity-70 hover:opacity-100 cursor-pointer select-none border-b border-transparent data-[expanded=true]:border-folio-border dark:data-[expanded=true]:border-folio-dark-border"
                data-expanded={isExpanded}
                onClick={toggleExpand}
                contentEditable={false}
            >
                <FileSliders size={16} />
                <span className="flex-1 font-semibold text-xs tracking-wider uppercase">Properties ({propertyCount})</span>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>

            {isExpanded && (
                <div className="p-4 pt-2 text-xs opacity-80 whitespace-pre-wrap leading-relaxed outline-none" contentEditable={false}>
                    {yaml || <span className="opacity-50 italic">Empty metadata</span>}
                </div>
            )}
        </NodeViewWrapper>
    )
}
