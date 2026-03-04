import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export const TypewriterMode = Extension.create({
    name: 'typewriterMode',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('typewriterMode'),

                props: {
                    handleScrollToSelection: () => true
                },

                view: (view) => {
                    let manualScrollActive = false
                    const setManualScroll = (active: boolean) => {
                        if (manualScrollActive !== active) {
                            manualScrollActive = active
                            window.dispatchEvent(new CustomEvent('folio:typewriter-manual-scroll', { detail: active }))
                        }
                    }
                    // Custom easing variables
                    let animationFrame: number | null = null

                    const easeInOutCubic = (t: number) =>
                        t < 0.5
                            ? 4 * t * t * t
                            : 1 - Math.pow(-2 * t + 2, 3) / 2

                    let isProgrammaticScroll = false

                    const scrollParent: Element | null =
                        view.dom.closest('.overflow-y-auto') ||
                        document.documentElement

                    const scrollTarget =
                        scrollParent === document.documentElement
                            ? window
                            : scrollParent

                    let isDragging = false

                    const onMouseDown = (e: MouseEvent) => {
                        if (view.dom.contains(e.target as Node)) {
                            isDragging = true
                        }
                    }

                    const onMouseUp = () => {
                        if (!isDragging) return
                        isDragging = false

                        if (!manualScrollActive &&
                            view.dom.getAttribute('data-typewriter-mode') === 'true') {
                            center(true)
                        }
                    }

                    document.addEventListener('mousedown', onMouseDown)
                    document.addEventListener('mouseup', onMouseUp)

                    const onTypewriterToggle = () => {
                        if (view.dom.getAttribute('data-typewriter-mode') === 'true') {
                            setManualScroll(false)
                            // Small delay to let React render the DOM changes (e.g. padding/margins)
                            setTimeout(() => {
                                center(true)
                            }, 50)
                        }
                    }
                    window.addEventListener('folio:typewriter-toggled', onTypewriterToggle)

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

                        // Compensate for the new dynamic 45vh padding on the container
                        let containerPadding = 0
                        if (scrollParent && scrollParent !== document.documentElement) {
                            const cs = window.getComputedStyle(scrollParent as Element)
                            containerPadding = parseFloat(cs.paddingTop) || 0
                        }

                        const cursorY = coords.top - containerRect.top
                        const targetY =
                            (containerRect.height / 2) -
                            ((coords.bottom - coords.top) / 2)

                        const scrollDiff = cursorY - targetY

                        const currentScroll =
                            scrollParent === document.documentElement
                                ? window.scrollY
                                : scrollParent!.scrollTop

                        const absoluteTarget = currentScroll + scrollDiff - containerPadding

                        if (Math.abs(scrollDiff - containerPadding) > 3) {
                            animateTo(absoluteTarget, smooth)
                        }
                    }

                    scrollTarget.addEventListener('scroll', disableTemporarily, { passive: true })

                    return {
                        update: (view, prevState) => {
                            if (view.dom.getAttribute('data-typewriter-mode') !== 'true') return

                            if (isDragging) return

                            const docChanged = !prevState.doc.eq(view.state.doc)
                            const selectionChanged = !prevState.selection.eq(view.state.selection)

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
                            scrollTarget.removeEventListener('scroll', disableTemporarily)
                            document.removeEventListener('mousedown', onMouseDown)
                            document.removeEventListener('mouseup', onMouseUp)
                            window.removeEventListener('folio:typewriter-toggled', onTypewriterToggle)
                        }
                    }
                }
            })
        ]
    }
})