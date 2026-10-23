import { NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { isTauri } from '../lib/config'
import { getCachePathForImage, IMAGE_LOADING_PLACEHOLDER, resolveAbsoluteImagePath, subscribeImageCacheUpdates } from '../lib/imageCache'

const MIN_WIDTH = 100
const imageRatioCache = new Map<string, number>()

function normalizePixelDimension(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const asNumber = typeof value === 'number' ? value : Number(String(value))
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null
    return Math.round(asNumber)
}

export default function ImageNodeView(props: NodeViewProps) {
    const { node, selected, updateAttributes } = props
    const wrapperRef = useRef<HTMLSpanElement | null>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const dragStateRef = useRef<{
        direction: 'left' | 'right' | 'top' | 'bottom'
        startX: number
        startY: number
        startWidth: number
        startHeight: number
        ratio: number
    } | null>(null)
    const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null)
    const [hasEnteredViewport, setHasEnteredViewport] = useState(false)
    const [isImageLoaded, setIsImageLoaded] = useState(false)
    const [naturalRatio, setNaturalRatio] = useState<number | null>(null)
    const [cachedSrc, setCachedSrc] = useState<string | null>(null)

    const src = String(node.attrs.src || '')
    const alt = String(node.attrs.alt || '')
    const width = normalizePixelDimension(node.attrs.width)
    const height = normalizePixelDimension(node.attrs.height)
    const absoluteSourcePath = resolveAbsoluteImagePath(src)
    const shouldDelayOffscreenLoad = isTauri() && Boolean(absoluteSourcePath)
    const uncachedSrc = useMemo(() => {
        if (shouldDelayOffscreenLoad && !hasEnteredViewport) {
            return IMAGE_LOADING_PLACEHOLDER
        }
        return getCachePathForImage(src)
    }, [shouldDelayOffscreenLoad, hasEnteredViewport, src])
    const resolvedSrc = cachedSrc || uncachedSrc

    const displayWidth = dragSize?.width ?? width
    const displayHeight = dragSize?.height ?? height
    const expectedRatio = useMemo(() => {
        if (displayWidth && displayHeight) {
            return Math.max(0.05, displayWidth / displayHeight)
        }
        return naturalRatio
    }, [displayHeight, displayWidth, naturalRatio])
    const isLoadingVisual = !isImageLoaded
    const imageStyle = useMemo(() => {
        if (!displayWidth && !displayHeight) {
            const style: CSSProperties = {
                maxWidth: '100%',
                height: 'auto',
            }
            if (expectedRatio) style.aspectRatio = `${expectedRatio}`
            return style
        }

        const style: CSSProperties = {
            maxWidth: '100%',
        }
        if (expectedRatio) style.aspectRatio = `${expectedRatio}`

        if (displayWidth) {
            style.width = `${displayWidth}px`
            // Keep height automatic whenever width is set so the image can't be stretched.
            style.height = 'auto'
            return style
        }
        if (displayHeight) {
            style.height = `${displayHeight}px`
        } else {
            style.height = 'auto'
        }

        return style
    }, [displayWidth, displayHeight, expectedRatio])

    useEffect(() => {
        return () => {
            dragStateRef.current = null
        }
    }, [])

    useEffect(() => {
        setHasEnteredViewport(false)
    }, [src])

    useEffect(() => {
        setIsImageLoaded(false)
        setNaturalRatio(imageRatioCache.get(src) || null)
        setCachedSrc(null)
    }, [src, absoluteSourcePath])

    useEffect(() => {
        if (!absoluteSourcePath) return

        return subscribeImageCacheUpdates((updatedPath, displayUrl) => {
            if (updatedPath === absoluteSourcePath) {
                setCachedSrc(displayUrl)
            }
        })
    }, [absoluteSourcePath])

    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper) return

        if (!shouldDelayOffscreenLoad) {
            setHasEnteredViewport(true)
            return
        }

        if (hasEnteredViewport) return

        const observer = new IntersectionObserver(
            (entries) => {
                const isVisible = entries.some((entry) => entry.isIntersecting)
                if (!isVisible) return
                setHasEnteredViewport(true)
                observer.disconnect()
            },
            {
                root: null,
                // Start warming slightly before true viewport entry.
                rootMargin: '240px 0px',
                threshold: 0.01,
            },
        )

        observer.observe(wrapper)
        return () => {
            observer.disconnect()
        }
    }, [hasEnteredViewport, shouldDelayOffscreenLoad])

    const handleImageLoaded = () => {
        if (resolvedSrc === IMAGE_LOADING_PLACEHOLDER) return

        const imageEl = imageRef.current
        if (imageEl && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0) {
            const ratio = imageEl.naturalWidth / imageEl.naturalHeight
            imageRatioCache.set(src, ratio)
            setNaturalRatio(ratio)
        }
        setIsImageLoaded(true)
    }

    const beginDrag = (event: React.MouseEvent, direction: 'left' | 'right' | 'top' | 'bottom') => {
        event.preventDefault()
        event.stopPropagation()

        const imageEl = imageRef.current
        const wrapperEl = wrapperRef.current
        const measuredWidth = width || imageEl?.clientWidth || wrapperEl?.clientWidth || MIN_WIDTH
        const measuredHeight = height || imageEl?.clientHeight || Math.round(measuredWidth * 0.6)
        const naturalRatio = imageEl && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0
            ? imageEl.naturalWidth / imageEl.naturalHeight
            : measuredHeight > 0
                ? measuredWidth / measuredHeight
                : 1

        dragStateRef.current = {
            direction,
            startX: event.clientX,
            startY: event.clientY,
            startWidth: measuredWidth,
            startHeight: measuredHeight,
            ratio: Math.max(0.01, naturalRatio),
        }
        setDragSize({ width: measuredWidth, height: measuredHeight })

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dragState = dragStateRef.current
            const currentWrapper = wrapperRef.current
            if (!dragState || !currentWrapper) return

            const editorRoot = currentWrapper.closest('.ProseMirror') as HTMLElement | null
            const maxWidth = Math.max(MIN_WIDTH, editorRoot?.clientWidth || currentWrapper.clientWidth || MIN_WIDTH)
            const deltaX = moveEvent.clientX - dragState.startX
            const deltaY = moveEvent.clientY - dragState.startY

            let nextWidth = dragState.startWidth
            if (dragState.direction === 'left' || dragState.direction === 'right') {
                const signedDelta = dragState.direction === 'right' ? deltaX : -deltaX
                nextWidth = Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, dragState.startWidth + signedDelta)))
            } else {
                const signedDelta = dragState.direction === 'bottom' ? deltaY : -deltaY
                const nextHeight = Math.max(40, dragState.startHeight + signedDelta)
                nextWidth = Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, nextHeight * dragState.ratio)))
            }

            const nextHeight = Math.max(40, Math.round(nextWidth / dragState.ratio))
            setDragSize({ width: nextWidth, height: nextHeight })
            // Persist width only; height remains derived from aspect ratio.
            updateAttributes({ width: nextWidth, height: null })
        }

        const onMouseUp = () => {
            dragStateRef.current = null
            setDragSize(null)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    }

    return (
        <NodeViewWrapper
            as="span"
            ref={wrapperRef}
            className={`image-node-view ${selected ? 'selected' : ''} ${isLoadingVisual ? 'is-loading' : ''}`}
            data-image-node-view="true"
        >
            {isLoadingVisual && <span className="image-skeleton" contentEditable={false} />}
            <img
                ref={imageRef}
                src={resolvedSrc}
                alt={alt}
                style={imageStyle}
                className={`image-node-media ${isLoadingVisual ? 'is-loading' : 'is-loaded'}`}
                loading="lazy"
                decoding="async"
                draggable={false}
                onLoad={handleImageLoaded}
                onError={handleImageLoaded}
                data-folium-image-source-path={absoluteSourcePath || undefined}
            />

            {selected && (
                <>
                    <span
                        className="image-resize-handle left"
                        onMouseDown={(event) => beginDrag(event, 'left')}
                        contentEditable={false}
                    />
                    <span
                        className="image-resize-handle right"
                        onMouseDown={(event) => beginDrag(event, 'right')}
                        contentEditable={false}
                    />
                    <span
                        className="image-resize-handle top"
                        onMouseDown={(event) => beginDrag(event, 'top')}
                        contentEditable={false}
                    />
                    <span
                        className="image-resize-handle bottom"
                        onMouseDown={(event) => beginDrag(event, 'bottom')}
                        contentEditable={false}
                    />
                </>
            )}

            {dragSize !== null && (
                <span className="image-width-label" contentEditable={false}>
                    {dragSize.width}x{dragSize.height}
                </span>
            )}
        </NodeViewWrapper>
    )
}
