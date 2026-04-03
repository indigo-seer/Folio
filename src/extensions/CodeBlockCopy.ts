import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

function createCopyButton() {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'folium-code-copy-btn'
    button.setAttribute('contenteditable', 'false')
    button.setAttribute('aria-label', 'Copy code block')
    button.setAttribute('title', 'Copy code')
    button.innerHTML = `
        <svg class="folium-code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="folium-code-copied-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `
    return button
}

export const CodeBlockCopy = Extension.create({
    name: 'codeBlockCopy',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('codeBlockCopy'),
                view: (view) => {
                    const editorElement = view.dom as HTMLElement
                    const host = editorElement.parentElement as HTMLElement | null
                    if (!host) return {}

                    host.classList.add('folium-code-copy-host')

                    const button = createCopyButton()
                    host.appendChild(button)

                    let activePre: HTMLElement | null = null
                    let hideTimer: number | null = null

                    const clearHideTimer = () => {
                        if (hideTimer !== null) {
                            window.clearTimeout(hideTimer)
                            hideTimer = null
                        }
                    }

                    const hideButton = () => {
                        activePre = null
                        button.classList.remove('is-visible')
                    }

                    const positionButtonForPre = (pre: HTMLElement) => {
                        const hostRect = host.getBoundingClientRect()
                        const preRect = pre.getBoundingClientRect()

                        const top = preRect.top - hostRect.top + host.scrollTop + 10
                        const left = preRect.right - hostRect.left + host.scrollLeft - 38

                        button.style.top = `${Math.max(0, top)}px`
                        button.style.left = `${Math.max(0, left)}px`
                        button.classList.add('is-visible')
                    }

                    const updateFromEventTarget = (target: EventTarget | null) => {
                        const node = target as HTMLElement | null
                        const pre = node?.closest?.('pre') as HTMLElement | null
                        if (!pre || !editorElement.contains(pre)) {
                            if (!button.matches(':hover')) {
                                clearHideTimer()
                                hideTimer = window.setTimeout(hideButton, 80)
                            }
                            return
                        }

                        clearHideTimer()
                        activePre = pre
                        positionButtonForPre(pre)
                    }

                    const handleMouseMove = (event: MouseEvent) => {
                        updateFromEventTarget(event.target)
                    }

                    const handleMouseLeaveEditor = () => {
                        if (button.matches(':hover')) return
                        clearHideTimer()
                        hideTimer = window.setTimeout(hideButton, 80)
                    }

                    const handleScroll = () => {
                        if (activePre) {
                            positionButtonForPre(activePre)
                        }
                    }

                    const handleButtonMouseDown = (event: MouseEvent) => {
                        event.preventDefault()
                    }

                    const handleButtonMouseLeave = () => {
                        if (!activePre) hideButton()
                    }

                    const handleButtonClick = async (event: MouseEvent) => {
                        event.preventDefault()
                        event.stopPropagation()

                        if (!activePre) return
                        const codeElement = activePre.querySelector('code')
                        const codeText = codeElement?.textContent ?? ''
                        if (!codeText) return

                        try {
                            await navigator.clipboard.writeText(codeText)
                            button.classList.add('is-copied')
                            window.setTimeout(() => button.classList.remove('is-copied'), 1200)
                        } catch (error) {
                            console.error('Failed to copy code block:', error)
                        }
                    }

                    editorElement.addEventListener('mousemove', handleMouseMove)
                    editorElement.addEventListener('mouseleave', handleMouseLeaveEditor)
                    host.addEventListener('scroll', handleScroll, { passive: true })
                    button.addEventListener('mousedown', handleButtonMouseDown)
                    button.addEventListener('mouseleave', handleButtonMouseLeave)
                    button.addEventListener('click', handleButtonClick)

                    return {
                        update: () => {
                            if (activePre && !editorElement.contains(activePre)) {
                                hideButton()
                            } else if (activePre) {
                                positionButtonForPre(activePre)
                            }
                        },
                        destroy: () => {
                            clearHideTimer()
                            editorElement.removeEventListener('mousemove', handleMouseMove)
                            editorElement.removeEventListener('mouseleave', handleMouseLeaveEditor)
                            host.removeEventListener('scroll', handleScroll)
                            button.removeEventListener('mousedown', handleButtonMouseDown)
                            button.removeEventListener('mouseleave', handleButtonMouseLeave)
                            button.removeEventListener('click', handleButtonClick)
                            button.remove()
                        },
                    }
                },
            }),
        ]
    },
})
