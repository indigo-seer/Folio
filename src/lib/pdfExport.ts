import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

interface ExportNoteAsPdfOptions {
    noteTitle: string
    noteHtml: string
    isDarkMode: boolean
}

interface ExportedPdfResult {
    bytes: Uint8Array
    fileName: string
}

const MIN_PAGE_HEIGHT_PX = 1123 // A4-ish visual baseline at 96dpi
const MAX_PDF_DIMENSION_PT = 14000 // practical single-page PDF cap
const PX_TO_PT = 0.75

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function sanitizeFileName(name: string): string {
    const cleaned = name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim()
    return cleaned || 'Untitled'
}

async function waitForImages(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll('img'))
    if (images.length === 0) return

    await Promise.all(images.map(async (img) => {
        if (img.complete) return
        try {
            await img.decode()
        } catch {
            await new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true })
                img.addEventListener('error', () => resolve(), { once: true })
            })
        }
    }))
}

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

export async function exportNoteAsPdf({ noteTitle, noteHtml, isDarkMode }: ExportNoteAsPdfOptions): Promise<ExportedPdfResult> {
    const title = sanitizeFileName(noteTitle)

    const exportRoot = document.createElement('div')
    exportRoot.setAttribute('aria-hidden', 'true')
    exportRoot.className = isDarkMode ? 'dark' : ''
    exportRoot.style.position = 'fixed'
    exportRoot.style.left = '-20000px'
    exportRoot.style.top = '0'
    exportRoot.style.pointerEvents = 'none'
    exportRoot.style.zIndex = '-1'
    exportRoot.style.overflow = 'hidden'
    exportRoot.style.width = `${Math.max(900, Math.min(1600, window.innerWidth || 1200))}px`

    exportRoot.innerHTML = `
      <main class="folium-pdf-shell bg-folium-bg dark:bg-folium-dark-bg text-folium-text dark:text-folium-dark-text" style="width:100%; padding:2.5rem 0 3rem;">
        <section style="max-width:76ch; margin:0 auto; padding:0 1.5rem 0.5rem;">
          <h1 class="note-title font-serif">${escapeHtml(title)}</h1>
        </section>
        <section style="max-width:76ch; margin:0 auto; padding:0 1.5rem;">
          <div class="prose-folium">${noteHtml}</div>
        </section>
      </main>
    `

    document.body.appendChild(exportRoot)

    const shell = exportRoot.firstElementChild as HTMLElement | null
    if (!shell) {
        exportRoot.remove()
        throw new Error('Failed to initialize PDF export layout')
    }

    try {
        await nextFrame()
        await nextFrame()
        await waitForImages(shell)
        if (document.fonts?.ready) {
            await document.fonts.ready
        }

        const contentWidthPx = Math.ceil(shell.getBoundingClientRect().width)
        const contentHeightPx = Math.max(MIN_PAGE_HEIGHT_PX, Math.ceil(shell.scrollHeight))
        shell.style.minHeight = `${contentHeightPx}px`

        await nextFrame()

        let scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1.5))
        const maxRenderedPixels = 35_000_000
        const estimatedPixels = contentWidthPx * contentHeightPx * scale * scale
        if (estimatedPixels > maxRenderedPixels) {
            scale = Math.max(1, Math.sqrt(maxRenderedPixels / (contentWidthPx * contentHeightPx)))
        }

        const bgColor = getComputedStyle(shell).backgroundColor || '#ffffff'
        const canvas = await html2canvas(shell, {
            backgroundColor: bgColor,
            width: contentWidthPx,
            height: contentHeightPx,
            windowWidth: contentWidthPx,
            windowHeight: contentHeightPx,
            scale,
            useCORS: true,
            allowTaint: true,
            logging: false
        })

        const imageData = canvas.toDataURL('image/png')
        let pdfWidthPt = contentWidthPx * PX_TO_PT
        let pdfHeightPt = contentHeightPx * PX_TO_PT

        if (pdfHeightPt > MAX_PDF_DIMENSION_PT || pdfWidthPt > MAX_PDF_DIMENSION_PT) {
            const shrinkFactor = Math.min(
                MAX_PDF_DIMENSION_PT / pdfHeightPt,
                MAX_PDF_DIMENSION_PT / pdfWidthPt
            )
            pdfWidthPt *= shrinkFactor
            pdfHeightPt *= shrinkFactor
        }

        const pdf = new jsPDF({
            unit: 'pt',
            format: [pdfWidthPt, pdfHeightPt],
            orientation: 'portrait',
            compress: true
        })

        pdf.addImage(imageData, 'PNG', 0, 0, pdfWidthPt, pdfHeightPt, undefined, 'FAST')
        const arrayBuffer = pdf.output('arraybuffer')

        return {
            bytes: new Uint8Array(arrayBuffer),
            fileName: `${title}.pdf`
        }
    } finally {
        exportRoot.remove()
    }
}
