import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { VaultContext } from '../contexts/VaultContext'
import { useTheme } from '../hooks/useTheme'

export function GraphView() {
    const { notes, backlinkIndex, onWikilinkClick } = useContext(VaultContext)
    const { theme } = useTheme()
    const containerRef = useRef<HTMLDivElement>(null)
    const fgRef = useRef<ForceGraphMethods>()
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [hoverNode, setHoverNode] = useState<string | null>(null)

    // Auto-resize
    useEffect(() => {
        if (!containerRef.current) return

        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                })
            }
        })
        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    // Prepare graph data
    const graphData = useMemo(() => {
        const nodesSet = new Set<string>()
        const links: { source: string, target: string }[] = []

        // Add all existing notes
        notes.forEach(note => nodesSet.add(note))

        // Process backlinks (target -> Set<sources>)
        for (const [target, sources] of backlinkIndex.entries()) {
            sources.forEach(source => {
                nodesSet.add(source)
                nodesSet.add(target)
                links.push({ source, target })
            })
        }

        const nodes = Array.from(nodesSet).map(id => ({
            id,
            name: id,
            isExisting: notes.has(id), // Missing notes (stubs) are false
            neighbors: new Set<string>() // Track connections for hover effect
        }))

        // Populate neighbors
        const nodeMap = new Map(nodes.map(n => [n.id, n]))
        links.forEach(link => {
            nodeMap.get(link.source)?.neighbors.add(link.target)
            nodeMap.get(link.target)?.neighbors.add(link.source)
        })

        return { nodes, links }
    }, [notes, backlinkIndex])

    const isEmpty = graphData.nodes.length === 0

    // Obsidian-like Theme Colors
    const isDark = theme === 'dark'
    const colors = {
        bg: isDark ? '#1E1E1E' : '#FFFFFF',
        nodeActive: isDark ? '#8A5AFA' : '#7341D8', // Hover purple
        nodeBase: isDark ? '#B3B3B3' : '#666666',   // Normal node grey
        nodeStub: isDark ? '#4A4A4A' : '#A0A0A0',   // Missing note
        nodeFaded: isDark ? '#333333' : '#E0E0E0',  // Unfocused node
        linkBase: isDark ? '#444444' : '#CCCCCC',
        linkActive: isDark ? '#8A5AFA' : '#7341D8',
        linkFaded: isDark ? '#222222' : '#EEEEEE',
        textBase: isDark ? '#D3D3D3' : '#333333',
        textFaded: isDark ? '#555555' : '#AAAAAA',
    }

    const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.name as string
        const size = node.isExisting ? 5 : 3

        const isHovered = hoverNode === node.id
        const isNeighbor = hoverNode && node.neighbors.has(hoverNode)

        let color = colors.nodeBase
        let textColor = colors.textBase

        if (hoverNode) {
            if (isHovered || isNeighbor) {
                color = colors.nodeActive
            } else {
                color = colors.nodeFaded
                textColor = colors.textFaded
            }
        } else if (!node.isExisting) {
            color = colors.nodeStub
        }

        // Draw node circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false)
        ctx.fillStyle = color
        ctx.fill()

        // Draw text label below node only if zoom is high enough to be readable
        if (globalScale >= 1.5 || isHovered || isNeighbor) {
            const fontSize = 12 / globalScale
            ctx.font = `${fontSize}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = textColor
            ctx.fillText(label, node.x, node.y + size + 2)
        }
    }

    return (
        <div ref={containerRef} className="w-full h-full relative bg-folium-bg dark:bg-folium-dark-bg">
            {isEmpty ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-folium-text dark:text-folium-dark-text opacity-70">
                    <svg className="w-16 h-16 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <p className="font-sans text-lg">No connections yet.</p>
                    <p className="font-sans text-sm mt-2">Add [[wikilinks]] between notes to see them here.</p>
                </div>
            ) : (
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    backgroundColor={colors.bg}
                    linkColor={link => {
                        const source = (link.source as any).id || link.source
                        const target = (link.target as any).id || link.target
                        if (!hoverNode) return colors.linkBase
                        if (source === hoverNode || target === hoverNode) return colors.linkActive
                        return colors.linkFaded
                    }}
                    linkWidth={link => {
                        const source = (link.source as any).id || link.source
                        const target = (link.target as any).id || link.target
                        if (hoverNode && (source === hoverNode || target === hoverNode)) return 2
                        return 1
                    }}
                    nodeCanvasObject={drawNode} // Use custom drawing function
                    nodeLabel={() => ''} // Disable default text tooltip
                    onNodeClick={node => {
                        if (node.id) onWikilinkClick(node.id as string)
                    }}
                    onNodeHover={node => {
                        setHoverNode(node ? (node.id as string) : null)
                        if (containerRef.current) {
                            containerRef.current.style.cursor = node ? 'pointer' : 'default'
                        }
                    }}
                    d3VelocityDecay={0.3} // Make physics less "floaty"
                    d3AlphaDecay={0.02} // Settle physics a bit faster
                />
            )}
        </div>
    )
}
