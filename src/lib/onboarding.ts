import { isTauri } from './config'

// ============================================================
// Starter Note — seeded into empty vaults after onboarding
// ============================================================

const STARTER_NOTE = `# Getting Started with Folium

Welcome — you're all set. Here are the essentials.

---

## Shortcuts

- **New note** — \`Ctrl+N\`
- **Quick switcher** — \`Ctrl+K\`
- **Focus mode** — \`Ctrl+,\`
- **Typewriter mode** — \`Ctrl+.\`

> On Mac, replace Ctrl with Cmd.

## Linking notes

Type \`[[\` to link to another note. Folium autocompletes from your vault. Linked notes appear in the graph view and backlinks panel.

## Your files

Every note is a plain \`.md\` file on disk. No lock-in, no database. Open them in any editor — they'll look exactly right.

---

*Delete this note whenever you like. It's yours.*
`

/**
 * Creates a starter note in the vault if the vault has no .md files yet.
 * Tauri-only — skips silently in browser environments.
 * Returns the path to the created note, or null if vault already has content.
 */
export async function createStarterNote(vaultPath: string): Promise<string | null> {
    if (!isTauri()) return null

    const { readDir } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')

    // Check if vault already has .md files
    try {
        const entries = await readDir(vaultPath)
        const hasMdFiles = entries.some(e =>
            e.name?.endsWith('.md')
        )
        if (hasMdFiles) return null
    } catch {
        // If readDir fails, we'll try to create anyway
    }

    const { writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const notePath = await join(vaultPath, 'Getting Started with Folium.md')

    if (!await exists(notePath)) {
        await writeTextFile(notePath, STARTER_NOTE)
    }

    return notePath
}

/**
 * Creates a fresh vault folder in the user's Documents directory.
 * Tauri-only — throws in browser environments.
 * Returns the path to the created folder.
 */
export async function createDefaultVault(): Promise<string> {
    if (!isTauri()) {
        throw new Error('Default vault creation requires Tauri')
    }

    const { documentDir, join } = await import('@tauri-apps/api/path')
    const { mkdir, exists } = await import('@tauri-apps/plugin-fs')

    const docsPath = await documentDir()
    const vaultPath = await join(docsPath, 'Folium Notes')

    if (!await exists(vaultPath)) {
        await mkdir(vaultPath, { recursive: true })
    }

    return vaultPath
}
