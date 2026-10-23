export interface DocumentSession {
    path: string
    baseline: string
    draft: string
    dirty: boolean
    version: number
}

export type FlushResult =
    | { status: 'clean' | 'saved'; path: string }
    | { status: 'conflict'; path: string; diskContent: string; draft: string }
    | { status: 'error'; path: string; error: unknown; draft: string }

interface DocumentIO {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
}

type Listener = (draft: string, source: symbol | null) => void

const sessions = new Map<string, DocumentSession>()
const queues = new Map<string, Promise<FlushResult>>()
const listeners = new Map<string, Set<Listener>>()
const RECOVERY_PREFIX = 'folium:recovery-draft:'

function recoveryKey(path: string) {
    return `${RECOVERY_PREFIX}${encodeURIComponent(path)}`
}

function persistRecovery(session: DocumentSession) {
    if (typeof localStorage === 'undefined') return
    try {
        if (session.dirty) {
            localStorage.setItem(recoveryKey(session.path), JSON.stringify({
                baseline: session.baseline,
                draft: session.draft,
            }))
        } else {
            localStorage.removeItem(recoveryKey(session.path))
        }
    } catch {
        // Drafts remain available in memory when browser storage is unavailable.
    }
}

function readRecovery(path: string): Pick<DocumentSession, 'baseline' | 'draft'> | null {
    if (typeof localStorage === 'undefined') return null
    try {
        const raw = localStorage.getItem(recoveryKey(path))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (typeof parsed?.baseline !== 'string' || typeof parsed?.draft !== 'string') return null
        return parsed
    } catch {
        return null
    }
}

export function openDocumentSession(path: string, diskContent: string): { content: string; recoveredDraft: boolean } {
    const current = sessions.get(path)
    if (current?.dirty) return { content: current.draft, recoveredDraft: true }

    const recovery = readRecovery(path)
    if (recovery && recovery.draft !== diskContent) {
        sessions.set(path, { path, ...recovery, dirty: true, version: 1 })
        return { content: recovery.draft, recoveredDraft: true }
    }

    const opened: DocumentSession = {
        path,
        baseline: diskContent,
        draft: diskContent,
        dirty: false,
        version: current?.version || 0,
    }
    sessions.set(path, opened)
    persistRecovery(opened)
    return { content: diskContent, recoveredDraft: false }
}

export function updateDocumentDraft(path: string, draft: string, source: symbol | null = null) {
    const session = sessions.get(path)
    if (!session) throw new Error(`Document session is not open: ${path}`)
    if (session.draft === draft) return

    session.draft = draft
    session.dirty = draft !== session.baseline
    session.version += 1
    persistRecovery(session)
    for (const listener of listeners.get(path) || []) listener(draft, source)
}

export function subscribeToDocument(path: string, listener: Listener): () => void {
    const pathListeners = listeners.get(path) || new Set<Listener>()
    pathListeners.add(listener)
    listeners.set(path, pathListeners)
    return () => {
        pathListeners.delete(listener)
        if (pathListeners.size === 0) listeners.delete(path)
    }
}

async function runFlush(path: string, io: DocumentIO): Promise<FlushResult> {
    const session = sessions.get(path)
    if (!session?.dirty) return { status: 'clean', path }

    const version = session.version
    const draft = session.draft
    try {
        const diskContent = await io.readFile(path)
        if (diskContent !== session.baseline && diskContent !== draft) {
            return { status: 'conflict', path, diskContent, draft }
        }

        await io.writeFile(path, draft)
        const latest = sessions.get(path)
        if (latest) {
            latest.baseline = draft
            latest.dirty = latest.version !== version
            persistRecovery(latest)
        }
        return { status: 'saved', path }
    } catch (error) {
        return { status: 'error', path, error, draft }
    }
}

export function flushDocumentSession(path: string, io: DocumentIO): Promise<FlushResult> {
    const previous = queues.get(path) || Promise.resolve({ status: 'clean', path } as FlushResult)
    const next = previous.catch(() => ({ status: 'clean', path } as FlushResult)).then(() => runFlush(path, io))
    queues.set(path, next)
    void next.finally(() => {
        if (queues.get(path) === next) queues.delete(path)
    })
    return next
}

export async function flushAllDocumentSessions(io: DocumentIO): Promise<FlushResult[]> {
    const dirtyPaths = [...sessions.values()].filter(session => session.dirty).map(session => session.path)
    return Promise.all(dirtyPaths.map(path => flushDocumentSession(path, io)))
}

export function discardDocumentDraft(path: string) {
    const session = sessions.get(path)
    if (session) {
        session.draft = session.baseline
        session.dirty = false
        persistRecovery(session)
    }
}

export function remapDocumentSessions(oldPath: string, newPath: string) {
    const prefix = `${oldPath.replace(/[\\/]+$/, '')}/`
    for (const [path, session] of [...sessions]) {
        if (path !== oldPath && !path.replace(/\\/g, '/').startsWith(prefix.replace(/\\/g, '/'))) continue
        const mappedPath = `${newPath}${path.slice(oldPath.length)}`
        sessions.delete(path)
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(recoveryKey(path))
        } catch { /* unavailable */ }
        session.path = mappedPath
        sessions.set(mappedPath, session)
        persistRecovery(session)
    }
}

export function removeDocumentSessions(path: string) {
    const prefix = `${path.replace(/[\\/]+$/, '')}/`
    for (const sessionPath of [...sessions.keys()]) {
        if (sessionPath !== path && !sessionPath.replace(/\\/g, '/').startsWith(prefix.replace(/\\/g, '/'))) continue
        sessions.delete(sessionPath)
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(recoveryKey(sessionPath))
        } catch { /* unavailable */ }
    }
}

export function getDocumentSession(path: string): Readonly<DocumentSession> | undefined {
    return sessions.get(path)
}
