import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export const SmoothCaret = Extension.create({
    name: 'smoothCaret',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('smoothCaret'),

                view(editorView) {
                    // ─── Inject styles ────────────────────────────────────────
                    const styleEl = document.createElement('style')
                    styleEl.id = 'smooth-caret-styles'
                    styleEl.textContent = `
                        @keyframes caret-blink {
                            0%, 45%  { opacity: 1; }
                            55%, 100% { opacity: 0; }
                        }

                        .smooth-caret {
                            position: fixed;
                            width: 1.5px;
                            pointer-events: none;
                            z-index: 10;
                            border-radius: 1px;
                            will-change: left, top, height, width;
                            background: var(--caret-color, #7C6AFB);

                            /* No transition by default — opt in explicitly when gliding */
                            transition: none;

                            /* Start blinking */
                            animation: caret-blink 1.1s ease-in-out infinite;
                        }

                        /* Kill the native caret across all ProseMirror instances */
                        .ProseMirror {
                            caret-color: transparent !important;
                        }
                    `
                    document.head.appendChild(styleEl)

                    // ─── Create caret element ─────────────────────────────────
                    const caret = document.createElement('div')
                    caret.className = 'smooth-caret'

                    // Mount inside the editor's scroll container so it clips correctly
                    const scrollContainer =
                        editorView.dom.closest('.overflow-y-auto') ||
                        editorView.dom.parentElement
                    scrollContainer?.appendChild(caret)

                    // ─── State ────────────────────────────────────────────────
                    let lastHead = -1
                    let isTyping = false
                    let typingTimeout: number | null = null
                    let pulseFrame: number | null = null

                    // ─── Typing detection ─────────────────────────────────────
                    const suspendBlink = () => {
                        caret.style.animationName = 'none'
                        caret.style.opacity = '1'
                    }

                    const resumeBlink = () => {
                        // Force animation restart by toggling name
                        caret.style.animationName = 'none'
                        requestAnimationFrame(() => {
                            caret.style.animationName = 'caret-blink'
                        })
                    }

                    // ─── Keydown: pulse width + suspend blink ─────────────────
                    const onKeyDown = (e: KeyboardEvent) => {
                        // Don't pulse on modifier-only keys
                        const isModifierOnly = ['Shift', 'Control', 'Alt', 'Meta',
                            'CapsLock', 'Tab', 'Escape'].includes(e.key)
                        if (isModifierOnly) return

                        isTyping = true
                        suspendBlink()

                        // Cancel any in-flight pulse (removed width pulse)
                        if (pulseFrame) cancelAnimationFrame(pulseFrame)

                        // Resume blink 500ms after last keystroke
                        if (typingTimeout) window.clearTimeout(typingTimeout)
                        typingTimeout = window.setTimeout(() => {
                            isTyping = false
                            resumeBlink()
                        }, 500)
                    }

                    editorView.dom.addEventListener('keydown', onKeyDown)

                    // ─── Scroll handling: Update position on scroll ───────────
                    const updatePosition = () => {
                        if (lastHead === -1) return

                        try {
                            const coords = editorView.coordsAtPos(lastHead)
                            const lineHeight = coords.bottom - coords.top
                            const top = coords.top
                            const left = coords.left

                            caret.style.transition = 'none' // Instant update on scroll
                            caret.style.left = `${left}px`
                            caret.style.top = `${top}px`
                            caret.style.height = `${lineHeight}px`
                        } catch (e) {
                            // Suppress errors if editor loses focus/selection during unmount
                        }
                    }

                    // Attach scroll listener to scroll container and window
                    if (scrollContainer) {
                        scrollContainer.addEventListener('scroll', updatePosition, { passive: true })
                    }
                    window.addEventListener('scroll', updatePosition, { passive: true })
                    window.addEventListener('resize', updatePosition, { passive: true })

                    // ─── Main update: position the caret ─────────────────────
                    return {
                        update(view) {
                            const { state } = view
                            const { selection } = state

                            // Hide during text selection — only show for collapsed cursor
                            if (!selection.empty) {
                                caret.style.opacity = '0'
                                lastHead = selection.head
                                return
                            }

                            caret.style.opacity = isTyping ? '1' : ''

                            // Detect jump vs continuous typing
                            // Jump = click, arrow key, wikilink click, tab switch
                            // Continuous = typing character by character (head moves by 1)
                            const headDelta = Math.abs(selection.head - lastHead)
                            const isJump = headDelta > 1 || headDelta === 0

                            // Get cursor coordinates from ProseMirror (these are relative to the viewport)
                            const coords = view.coordsAtPos(selection.head)
                            const lineHeight = coords.bottom - coords.top

                            const top = coords.top
                            const left = coords.left

                            if (isJump && !isTyping) {
                                // Glide to new position — click or navigation
                                caret.style.transition = [
                                    'left 120ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                                    'top 120ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                                    'height 80ms ease',
                                ].join(', ')

                                // Resume blink at destination after glide completes
                                if (!isTyping) {
                                    setTimeout(resumeBlink, 130)
                                }
                            } else {
                                // Add a very subtle, extremely fast spring physics micro-glide
                                // instead of instantaneous jump, making typing feel liquid.
                                caret.style.transition = 'left 180ms cubic-bezier(0.2, 0.9, 0.4, 1), top 80ms cubic-bezier(0.2, 0.9, 0.4, 1)'
                            }

                            caret.style.left = `${left}px`
                            caret.style.top = `${top}px`
                            caret.style.height = `${lineHeight}px`

                            lastHead = selection.head
                        },

                        destroy() {
                            caret.remove()
                            styleEl.remove()
                            editorView.dom.removeEventListener('keydown', onKeyDown)

                            if (scrollContainer) {
                                scrollContainer.removeEventListener('scroll', updatePosition)
                            }
                            window.removeEventListener('scroll', updatePosition)
                            window.removeEventListener('resize', updatePosition)

                            if (typingTimeout) window.clearTimeout(typingTimeout)
                            if (pulseFrame) cancelAnimationFrame(pulseFrame)
                        }
                    }
                }
            })
        ]
    }
})
