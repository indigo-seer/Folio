import { Extension } from '@tiptap/core'
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'

export const TypewriterMode = Extension.create({
    name: 'typewriterMode',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('typewriterMode'),

                props: {
                    handleScrollToSelection: () => true
                },

                view: (view: EditorView) => {
                    let manualScrollActive = false
                    const setManualScroll = (active: boolean) => {
                        if (manualScrollActive !== active) {
                            manualScrollActive = active
                            window.dispatchEvent(new CustomEvent('folium:typewriter-manual-scroll', { detail: active }))
                        }
                    }
                    // Custom easing variables
                    let animationFrame: number | null = null

                    const easeInOutCubic = (t: number) =>
                        t < 0.5
                            ? 4 * t * t * t
                            : 1 - Math.pow(-2 * t + 2, 3) / 2

                    let isProgrammaticScroll = false

                    const scrollParent: Element =
                        view.dom.closest('.overflow-y-auto') ||
                        document.documentElement

                    const scrollTarget =
                        scrollParent === document.documentElement
                            ? window
                            : scrollParent

                    let isDragging = false
                    let pointerMoved = false
                    let pointerStartX = 0
                    let pointerStartY = 0
                    let pendingClickCenter: number | null = null

                    const onMouseDown = (e: MouseEvent) => {
                        if (pendingClickCenter !== null) {
                            window.clearTimeout(pendingClickCenter)
                            pendingClickCenter = null
                        }
                        if (view.dom.contains(e.target as Node)) {
                            isDragging = true
                            pointerMoved = false
                            pointerStartX = e.clientX
                            pointerStartY = e.clientY
                        }
                    }

                    const onMouseMove = (e: MouseEvent) => {
                        if (!isDragging || pointerMoved) return
                        if (Math.abs(e.clientX - pointerStartX) + Math.abs(e.clientY - pointerStartY) > 4) {
                            pointerMoved = true
                        }
                    }

                    const onMouseUp = (e: MouseEvent) => {
                        if (!isDragging) return
                        isDragging = false

                        const wasPointerSelection = pointerMoved || e.detail > 1
                        pointerMoved = false

                        // WKWebView finalizes double-click/drag selections after
                        // mouseup. Scrolling during that window can extend the
                        // native selection toward the viewport edge. Wait for
                        // the committed ProseMirror selection, and only center
                        // a collapsed caret placed by a genuine single click.
                        if (wasPointerSelection) return

                        // Delay just beyond the second-click window. A second
                        // mousedown cancels this before WKWebView begins its
                        // word-selection update.
                        pendingClickCenter = window.setTimeout(() => {
                            pendingClickCenter = null
                            requestAnimationFrame(() => {
                                if (!view.state.selection.empty) return
                                if (manualScrollActive) return
                                if (view.dom.getAttribute('data-typewriter-mode') !== 'true') return
                                center(true)
                            })
                        }, 500)
                    }

                    document.addEventListener('mousedown', onMouseDown)
                    document.addEventListener('mousemove', onMouseMove)
                    document.addEventListener('mouseup', onMouseUp)

                    const onTypewriterToggle = () => {
                        if (view.dom.getAttribute('data-typewriter-mode') === 'true') {
                            setManualScroll(false)
                            // We need to wait for the .typewriter-active-container CSS transition
                            // and React's DOM insertion to actually finish applying the 45vh padding
                            // before we measure bounding client rects.
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    center(true)
                                })
                            })
                        }
                    }
                    window.addEventListener('folium:typewriter-toggled', onTypewriterToggle)

                    const animateTo = (absoluteTargetY: number, isSmooth: boolean) => {
                        if (animationFrame) cancelAnimationFrame(animationFrame)

                        const start =
                            scrollParent === document.documentElement
                                ? window.scrollY
                                : scrollParent!.scrollTop

                        const distance = absoluteTargetY - start

                        // Instant scroll (e.g., continuous typing)
                        if (!isSmooth) {
                            isProgrammaticScroll = true
                            if (scrollParent === document.documentElement) {
                                window.scrollTo(0, absoluteTargetY)
                            } else {
                                scrollParent!.scrollTop = absoluteTargetY
                            }
                            requestAnimationFrame(() => {
                                isProgrammaticScroll = false
                            })
                            return
                        }

                        // Smooth animated glide
                        const duration = Math.min(
                            3200, // max 1.2s
                            Math.max(600, Math.abs(distance) * 0.8)
                        )

                        const startTime = performance.now()
                        isProgrammaticScroll = true

                        const step = (now: number) => {
                            const elapsed = now - startTime
                            const progress = Math.min(elapsed / duration, 1)
                            const eased = easeInOutCubic(progress)

                            const current = start + distance * eased

                            if (scrollParent === document.documentElement) {
                                window.scrollTo(0, current)
                            } else {
                                scrollParent!.scrollTop = current
                            }

                            if (progress < 1) {
                                animationFrame = requestAnimationFrame(step)
                            } else {
                                isProgrammaticScroll = false
                                animationFrame = null
                            }
                        }

                        animationFrame = requestAnimationFrame(step)
                    }

                    const disableTemporarily = () => {
                        if (isProgrammaticScroll) return
                        if (isDragging) return


                        if (animationFrame) {
                            cancelAnimationFrame(animationFrame)
                            animationFrame = null
                        }

                        setManualScroll(true)
                    }

                    const center = (smooth: boolean) => {
                        const { state } = view
                        const { selection } = state
                        const coords = view.coordsAtPos(selection.head)

                        const containerRect =
                            scrollParent === document.documentElement
                                ? { top: 0, height: window.innerHeight }
                                : scrollParent!.getBoundingClientRect()


                        // cursorY is the pixel distance from the TOP OF THE SCROLL BOX strictly to the caret
                        const cursorY = coords.top - containerRect.top

                        // targetY is the exact middle of the screen
                        const targetY = (containerRect.height / 2) - ((coords.bottom - coords.top) / 2)

                        // The difference between where the cursor is currently on the screen versus where it should be
                        const scrollDiff = cursorY - targetY

                        const currentScroll =
                            scrollParent === document.documentElement
                                ? window.scrollY
                                : scrollParent!.scrollTop

                        // Apply the diff to the current real scroll
                        let absoluteTarget = currentScroll + scrollDiff

                        if (Math.abs(scrollDiff) > 3) {
                            animateTo(absoluteTarget, smooth)
                        }
                    }

                    if (scrollTarget) {
                        scrollTarget.addEventListener('scroll', disableTemporarily, { passive: true })
                    }

                    return {
                        update: (view: EditorView, prevState: EditorState) => {
                            const docChanged = !prevState.doc.eq(view.state.doc)
                            const selectionChanged = !prevState.selection.eq(view.state.selection)

                            if (view.dom.getAttribute('data-typewriter-mode') !== 'true') return

                            if (isDragging) return

                            // Resume only on typing
                            if (manualScrollActive && docChanged) {
                                setManualScroll(false)
                                center(true)
                                return
                            }

                            // Normal continuous typing
                            if (!manualScrollActive && selectionChanged) {
                                center(false)
                            }
                        },

                        destroy() {
                            if (pendingClickCenter !== null) {
                                window.clearTimeout(pendingClickCenter)
                            }
                            if (scrollTarget) {
                                scrollTarget.removeEventListener('scroll', disableTemporarily)
                            }
                            document.removeEventListener('mousedown', onMouseDown)
                            document.removeEventListener('mousemove', onMouseMove)
                            document.removeEventListener('mouseup', onMouseUp)
                            window.removeEventListener('folium:typewriter-toggled', onTypewriterToggle)
                        }
                    }
                }
            })
        ]
    }
})
