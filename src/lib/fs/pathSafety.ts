const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export class EntryExistsError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EntryExistsError'
    }
}

export function validateEntryName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed || trimmed === '.' || trimmed === '..') {
        throw new Error('A file or folder name is required.')
    }
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
        throw new Error('Names cannot contain path separators.')
    }
    if (/[<>:"|?*]/.test(trimmed) || WINDOWS_RESERVED_NAME.test(trimmed)) {
        throw new Error('This name is not valid on all supported platforms.')
    }
    if (/[. ]$/.test(trimmed)) {
        throw new Error('Names cannot end with a period or space.')
    }
    return trimmed
}

export function markdownFilename(name: string): string {
    const validName = validateEntryName(name)
    return validName.toLowerCase().endsWith('.md') ? validName : `${validName}.md`
}

function normalizeLexically(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    const prefixMatch = normalized.match(/^(?:[A-Za-z]:|\/\/[^/]+\/[^/]+|\/)/)
    const prefix = prefixMatch?.[0] || ''
    const rest = normalized.slice(prefix.length)
    const segments: string[] = []

    for (const segment of rest.split('/')) {
        if (!segment || segment === '.') continue
        if (segment === '..') {
            if (segments.length === 0) throw new Error('Path escapes its allowed root.')
            segments.pop()
            continue
        }
        segments.push(segment)
    }

    const joined = segments.join('/')
    if (prefix === '/') return `/${joined}`.replace(/\/$/, '') || '/'
    if (prefix.startsWith('//')) return `${prefix}/${joined}`.replace(/\/$/, '')
    if (prefix.endsWith(':')) return `${prefix}/${joined}`.replace(/\/$/, '')
    return joined
}

export function assertPathWithinRoot(rootPath: string, candidatePath: string): string {
    const root = normalizeLexically(rootPath).replace(/\/$/, '')
    const candidate = normalizeLexically(candidatePath).replace(/\/$/, '')
    const caseInsensitive = /^[A-Za-z]:\//.test(root) || root.startsWith('//')
    const comparableRoot = caseInsensitive ? root.toLowerCase() : root
    const comparableCandidate = caseInsensitive ? candidate.toLowerCase() : candidate

    if (comparableCandidate !== comparableRoot && !comparableCandidate.startsWith(`${comparableRoot}/`)) {
        throw new Error('Path is outside the selected vault.')
    }
    return candidate
}
