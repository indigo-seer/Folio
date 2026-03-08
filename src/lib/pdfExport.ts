interface ExportNoteAsPdfOptions {
    noteTitle: string
    noteHtml: string
    isDarkMode: boolean
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function getStylesheetMarkup(doc: Document): string {
    const nodes = doc.querySelectorAll('style, link[rel="stylesheet"]')
    return Array.from(nodes)
        .map((node) => node.outerHTML)
        .join('\n')
}

async function waitForImages(doc: Document): Promise<void> {
    const images = Array.from(doc.images)
    if (images.length === 0) return

    await Promise.all(
        images.map((img) => {
            if (img.complete) return Promise.resolve()
            return new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true })
                img.addEventListener('error', () => resolve(), { once: true })
            })
        })
    )
}

export async function exportNoteAsPdf({ noteTitle, noteHtml, isDarkMode }: ExportNoteAsPdfOptions): Promise<void> {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'
    document.body.appendChild(iframe)

    const frameDoc = iframe.contentDocument
    const frameWindow = iframe.contentWindow
    if (!frameDoc || !frameWindow) {
        iframe.remove()
        throw new Error('Failed to initialize export frame')
    }

    const title = noteTitle.trim() || 'Untitled'
    const documentClass = isDarkMode ? 'dark' : ''
    const styles = getStylesheetMarkup(document)

    frameDoc.open()
    frameDoc.write(`<!doctype html>
<html lang="en" class="${documentClass}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} - Folio</title>
    ${styles}
    <style>
      html, body {
        overflow: visible !important;
        overscroll-behavior: auto !important;
      }

      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .folio-pdf-shell {
        min-height: 100vh;
        padding: 2.5rem 0 3rem;
      }

      .folio-pdf-title-wrap,
      .folio-pdf-content-wrap {
        max-width: 76ch;
        margin: 0 auto;
        padding: 0 1.5rem;
      }

      .folio-pdf-title-wrap {
        padding-bottom: 0.5rem;
      }

      .folio-pdf-content-wrap .ProseMirror {
        min-height: 0 !important;
        padding-bottom: 0 !important;
      }

      .folio-pdf-content-wrap [contenteditable="true"] {
        caret-color: transparent !important;
      }

      @page {
        margin: 0;
        size: auto;
      }

      @media print {
        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
        }

        .folio-pdf-shell {
          min-height: auto;
        }

        .note-title {
          margin-top: 0 !important;
          page-break-after: avoid;
        }

        .prose-folio h1,
        .prose-folio h2,
        .prose-folio h3 {
          break-after: avoid;
          break-inside: avoid;
        }

        .prose-folio pre,
        .prose-folio blockquote,
        .prose-folio img {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body class="${documentClass}">
    <main class="folio-pdf-shell">
      <section class="folio-pdf-title-wrap">
        <h1 class="note-title">${escapeHtml(title)}</h1>
      </section>
      <section class="folio-pdf-content-wrap">
        <div class="prose-folio ProseMirror">${noteHtml}</div>
      </section>
    </main>
  </body>
</html>`)
    frameDoc.close()

    await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve))
    await waitForImages(frameDoc)
    if (frameDoc.fonts?.ready) {
        await frameDoc.fonts.ready
    }

    let cleanedUp = false
    const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        iframe.remove()
    }

    frameWindow.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 15000)

    frameWindow.focus()
    frameWindow.print()
}
