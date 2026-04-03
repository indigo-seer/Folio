type EditorPane = 'main' | 'split'

interface MemorySample {
    at: number
    usedMB: number
    totalMB: number
    limitMB: number
}

interface PerformanceWithMemory extends Performance {
    memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
    }
}

interface AnimationAuditState {
    name: string
    startedAt: number
    expectedDurationMs: number
    lastFrameAt: number
    frames: number
    jankFrames: number
    severeJankFrames: number
    maxFrameDeltaMs: number
    totalFrameDeltaMs: number
    rafId: number | null
    stopped: boolean
    startHeapMB: number | null
}

const PERF_PREFIX = '[Folium Perf]'
const PERF_STORAGE_KEY = 'folium_perf_audit'
const PERF_QUERY_KEY = 'foliumPerf'

const TYPING_LAG_WARN_MS = 40
const TYPING_SUMMARY_EVERY = 30
const TYPING_BURST_WINDOW_MS = 1200
const DEFAULT_FRAME_BUDGET_MS = 16.7

const EVENT_LOOP_INTERVAL_MS = 1000
const EVENT_LOOP_WARN_DRIFT_MS = 120

const MEMORY_SAMPLE_INTERVAL_MS = 10000
const MEMORY_TREND_WINDOW_MS = 120000
const MEMORY_WARN_GROWTH_MB = 64
const MB = 1024 * 1024

let consumerCount = 0
let teardownActiveMonitors: (() => void) | null = null

let enabled = false
let booted = false

let lastEditorKeydownAt = 0
let pendingTypingKeydownAt: number | null = null
let typingLagSamples = 0
let typingLagTotalMs = 0
let typingLagMaxMs = 0

let typingBurstEndsAt = 0
let typingBurstRafId: number | null = null
let typingBurstLastFrameAt = 0
let typingBurstFrames = 0
let typingBurstJankFrames = 0
let typingBurstMaxFrameDeltaMs = 0
let typingBurstTotalDeltaMs = 0
let typingBurstCount = 0

let memorySamples: MemorySample[] = []
let lastMemoryInfoLogAt = 0
let memoryUnsupportedLogged = false

let calibratedFrameBudgetMs = DEFAULT_FRAME_BUDGET_MS
let frameJankThresholdMs = 26
let frameSevereJankThresholdMs = 40
let calibrationRafId: number | null = null

function recomputeFrameThresholds(frameBudgetMs: number) {
    calibratedFrameBudgetMs = frameBudgetMs
    frameJankThresholdMs = Math.max(frameBudgetMs * 1.6, 22)
    frameSevereJankThresholdMs = Math.max(frameBudgetMs * 2.5, 34)
}

function computeMedian(values: number[]): number {
    if (values.length === 0) return DEFAULT_FRAME_BUDGET_MS
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 1) {
        return sorted[mid]
    }
    return (sorted[mid - 1] + sorted[mid]) / 2
}

function startFrameBudgetCalibration() {
    const deltas: number[] = []
    let previousAt = 0

    const step = (timestamp: number) => {
        if (!enabled) return

        if (previousAt > 0) {
            const delta = timestamp - previousAt
            if (delta > 4 && delta < 250) {
                deltas.push(delta)
            }
        }
        previousAt = timestamp

        if (deltas.length >= 80) {
            const median = computeMedian(deltas)
            recomputeFrameThresholds(median)
            console.info(
                `${PERF_PREFIX} frame budget calibrated: ${median.toFixed(1)}ms ` +
                `(~${(1000 / median).toFixed(1)}fps). ` +
                `jank>${frameJankThresholdMs.toFixed(1)}ms, severe>${frameSevereJankThresholdMs.toFixed(1)}ms`
            )
            calibrationRafId = null
            return
        }

        calibrationRafId = window.requestAnimationFrame(step)
    }

    calibrationRafId = window.requestAnimationFrame(step)
}

function isEnabledByConfig(): boolean {
    if (typeof window === 'undefined') return false

    const params = new URLSearchParams(window.location.search)
    const query = params.get(PERF_QUERY_KEY)
    if (query === '1') return true
    if (query === '0') return false

    try {
        const stored = window.localStorage.getItem(PERF_STORAGE_KEY)
        if (stored === '1') return true
        if (stored === '0') return false
    } catch {
        // Ignore localStorage read failures in restricted environments.
    }

    return Boolean(import.meta.env.DEV)
}

function readHeapUsageMB(): { usedMB: number; totalMB: number; limitMB: number } | null {
    const perf = performance as PerformanceWithMemory
    if (!perf.memory) return null
    return {
        usedMB: perf.memory.usedJSHeapSize / MB,
        totalMB: perf.memory.totalJSHeapSize / MB,
        limitMB: perf.memory.jsHeapSizeLimit / MB,
    }
}

function resetTypingBurstStats() {
    typingBurstLastFrameAt = 0
    typingBurstFrames = 0
    typingBurstJankFrames = 0
    typingBurstMaxFrameDeltaMs = 0
    typingBurstTotalDeltaMs = 0
}

function finalizeTypingBurst() {
    if (!enabled) return

    typingBurstCount += 1
    const avgFrameDeltaMs = typingBurstFrames > 1
        ? typingBurstTotalDeltaMs / (typingBurstFrames - 1)
        : 0
    const approxFps = avgFrameDeltaMs > 0 ? 1000 / avgFrameDeltaMs : 0
    const hadJank = typingBurstJankFrames > 0 || typingBurstMaxFrameDeltaMs >= frameSevereJankThresholdMs

    if (hadJank || typingBurstCount % 8 === 0) {
        const logger = hadJank ? console.warn : console.info
        logger(
            `${PERF_PREFIX} typing burst: frames=${typingBurstFrames}, ` +
            `jank=${typingBurstJankFrames}, maxFrame=${typingBurstMaxFrameDeltaMs.toFixed(1)}ms, ` +
            `avgFrame=${avgFrameDeltaMs.toFixed(1)}ms (~${approxFps.toFixed(1)}fps)`
        )
    }

    resetTypingBurstStats()
    typingBurstRafId = null
}

function runTypingBurstFrameAudit(now: number) {
    if (!enabled) {
        typingBurstRafId = null
        return
    }

        typingBurstFrames += 1

    if (typingBurstLastFrameAt > 0) {
        const frameDeltaMs = now - typingBurstLastFrameAt
        typingBurstTotalDeltaMs += frameDeltaMs
        typingBurstMaxFrameDeltaMs = Math.max(typingBurstMaxFrameDeltaMs, frameDeltaMs)

        if (frameDeltaMs >= frameJankThresholdMs) {
            typingBurstJankFrames += 1
        }
    }

    typingBurstLastFrameAt = now

    if (now < typingBurstEndsAt) {
        typingBurstRafId = window.requestAnimationFrame(runTypingBurstFrameAudit)
        return
    }

    finalizeTypingBurst()
}

function sampleMemory() {
    if (!enabled) return

    const heap = readHeapUsageMB()
    if (!heap) {
        if (!memoryUnsupportedLogged) {
            memoryUnsupportedLogged = true
            console.info(`${PERF_PREFIX} performance.memory is unavailable in this runtime.`)
        }
        return
    }

    const now = performance.now()
    memorySamples.push({
        at: now,
        usedMB: heap.usedMB,
        totalMB: heap.totalMB,
        limitMB: heap.limitMB,
    })

    memorySamples = memorySamples.filter(sample => now - sample.at <= MEMORY_TREND_WINDOW_MS)

    if (now - lastMemoryInfoLogAt >= 60000) {
        lastMemoryInfoLogAt = now
        console.info(
            `${PERF_PREFIX} heap: used=${heap.usedMB.toFixed(1)}MB / ` +
            `total=${heap.totalMB.toFixed(1)}MB (limit=${heap.limitMB.toFixed(0)}MB)`
        )
    }

    if (memorySamples.length < 6) return

    const usedValues = memorySamples.map(sample => sample.usedMB)
    const minUsed = Math.min(...usedValues)
    const latestUsed = usedValues[usedValues.length - 1]
    const growthMB = latestUsed - minUsed

    let upwardSteps = 0
    let comparedSteps = 0
    for (let i = 1; i < usedValues.length; i += 1) {
        comparedSteps += 1
        if (usedValues[i] > usedValues[i - 1]) upwardSteps += 1
    }

    const upwardRatio = comparedSteps > 0 ? upwardSteps / comparedSteps : 0

    if (growthMB >= MEMORY_WARN_GROWTH_MB && upwardRatio >= 0.75) {
        console.warn(
            `${PERF_PREFIX} possible memory leak: +${growthMB.toFixed(1)}MB over ` +
            `${Math.round(MEMORY_TREND_WINDOW_MS / 1000)}s ` +
            `(upward samples ${(upwardRatio * 100).toFixed(0)}%).`
        )
    }
}

function buildAnimationFinalizer(state: AnimationAuditState, reason: 'completed' | 'stopped') {
    return () => {
        if (!enabled || state.stopped) return
        state.stopped = true

        if (state.rafId !== null) {
            window.cancelAnimationFrame(state.rafId)
            state.rafId = null
        }

        const elapsedMs = performance.now() - state.startedAt
        if (elapsedMs < 120) return

        const avgFrameDeltaMs = state.frames > 1
            ? state.totalFrameDeltaMs / (state.frames - 1)
            : 0
        const approxFps = avgFrameDeltaMs > 0 ? 1000 / avgFrameDeltaMs : 0

        const endHeapMB = readHeapUsageMB()?.usedMB ?? null
        const heapDeltaText = state.startHeapMB !== null && endHeapMB !== null
            ? `, heapDelta=${(endHeapMB - state.startHeapMB).toFixed(1)}MB`
            : ''

        const isConcerning = state.severeJankFrames > 0 || state.maxFrameDeltaMs >= 45
        const logger = isConcerning ? console.warn : console.info
        logger(
            `${PERF_PREFIX} ${state.name} (${reason}): duration=${elapsedMs.toFixed(0)}ms, ` +
            `frames=${state.frames}, jank=${state.jankFrames}, severeJank=${state.severeJankFrames}, ` +
            `maxFrame=${state.maxFrameDeltaMs.toFixed(1)}ms, avgFrame=${avgFrameDeltaMs.toFixed(1)}ms ` +
            `(~${approxFps.toFixed(1)}fps, budget=${calibratedFrameBudgetMs.toFixed(1)}ms)${heapDeltaText}`
        )
    }
}

function createAnimationFrameStep(state: AnimationAuditState, finalize: () => void) {
    return (timestamp: number) => {
        if (!enabled || state.stopped) return

        state.frames += 1

        if (state.lastFrameAt > 0) {
            const frameDeltaMs = timestamp - state.lastFrameAt
            state.maxFrameDeltaMs = Math.max(state.maxFrameDeltaMs, frameDeltaMs)
            state.totalFrameDeltaMs += frameDeltaMs

            if (frameDeltaMs >= frameJankThresholdMs) {
                state.jankFrames += 1
            }
            if (frameDeltaMs >= frameSevereJankThresholdMs) {
                state.severeJankFrames += 1
            }
        }

        state.lastFrameAt = timestamp

        if (timestamp - state.startedAt >= state.expectedDurationMs) {
            finalize()
            return
        }

        state.rafId = window.requestAnimationFrame(createAnimationFrameStep(state, finalize))
    }
}

function bootMonitors() {
    enabled = isEnabledByConfig()
    booted = true
    memorySamples = []
    lastMemoryInfoLogAt = 0

    if (!enabled) return

    console.info(
        `${PERF_PREFIX} enabled. ` +
        `Use localStorage.setItem('${PERF_STORAGE_KEY}','1') to keep it on, or '0' to silence logs.`
    )
    recomputeFrameThresholds(DEFAULT_FRAME_BUDGET_MS)
    startFrameBudgetCalibration()

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.isComposing) return
        if (event.ctrlKey || event.metaKey || event.altKey) return

        const target = event.target
        if (!(target instanceof Element)) return
        if (!target.closest('.ProseMirror')) return

        lastEditorKeydownAt = performance.now()
        pendingTypingKeydownAt = lastEditorKeydownAt
        typingBurstEndsAt = lastEditorKeydownAt + TYPING_BURST_WINDOW_MS

        if (typingBurstRafId === null) {
            resetTypingBurstStats()
            typingBurstRafId = window.requestAnimationFrame(runTypingBurstFrameAudit)
        }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    let eventLoopLastTickAt = performance.now()
    const eventLoopTimerId = window.setInterval(() => {
        const now = performance.now()
        const driftMs = now - eventLoopLastTickAt - EVENT_LOOP_INTERVAL_MS
        eventLoopLastTickAt = now

        if (driftMs >= EVENT_LOOP_WARN_DRIFT_MS) {
            console.warn(`${PERF_PREFIX} event loop lag spike: ${driftMs.toFixed(1)}ms`)
        }
    }, EVENT_LOOP_INTERVAL_MS)

    const memoryTimerId = window.setInterval(() => {
        sampleMemory()
    }, MEMORY_SAMPLE_INTERVAL_MS)

    sampleMemory()

    let longTaskObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try {
            longTaskObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    console.warn(`${PERF_PREFIX} long task detected: ${entry.duration.toFixed(1)}ms`)
                }
            })
            longTaskObserver.observe({ entryTypes: ['longtask'] })
        } catch {
            // Ignore observer setup failures in unsupported runtimes.
        }
    }

    teardownActiveMonitors = () => {
        document.removeEventListener('keydown', handleKeyDown, true)
        window.clearInterval(eventLoopTimerId)
        window.clearInterval(memoryTimerId)

        if (typingBurstRafId !== null) {
            window.cancelAnimationFrame(typingBurstRafId)
            typingBurstRafId = null
        }
        if (calibrationRafId !== null) {
            window.cancelAnimationFrame(calibrationRafId)
            calibrationRafId = null
        }

        longTaskObserver?.disconnect()
        longTaskObserver = null
    }
}

function teardownMonitors() {
    teardownActiveMonitors?.()
    teardownActiveMonitors = null

    enabled = false
    booted = false
    lastEditorKeydownAt = 0
    pendingTypingKeydownAt = null
    typingLagSamples = 0
    typingLagTotalMs = 0
    typingLagMaxMs = 0
    memorySamples = []
    lastMemoryInfoLogAt = 0
    memoryUnsupportedLogged = false
    resetTypingBurstStats()
}

export function startPerformanceAudit() {
    consumerCount += 1

    if (!booted) {
        bootMonitors()
    }

    return () => {
        consumerCount = Math.max(0, consumerCount - 1)
        if (consumerCount === 0) {
            teardownMonitors()
        }
    }
}

export function recordTypingUpdate(pane: EditorPane, docSize: number) {
    if (!enabled || pendingTypingKeydownAt === null) return

    const now = performance.now()
    const lagMs = now - pendingTypingKeydownAt
    pendingTypingKeydownAt = null
    if (lagMs < 0 || lagMs > 2000) return

    typingLagSamples += 1
    typingLagTotalMs += lagMs
    typingLagMaxMs = Math.max(typingLagMaxMs, lagMs)

    if (lagMs >= TYPING_LAG_WARN_MS) {
        console.warn(
            `${PERF_PREFIX} typing lag: ${lagMs.toFixed(1)}ms in ${pane} pane (docSize=${docSize}).`
        )
    }

    if (typingLagSamples % TYPING_SUMMARY_EVERY === 0) {
        const avgLagMs = typingLagTotalMs / typingLagSamples
        console.info(
            `${PERF_PREFIX} typing summary (${typingLagSamples} samples): ` +
            `avg=${avgLagMs.toFixed(1)}ms, max=${typingLagMaxMs.toFixed(1)}ms`
        )
    }
}

export function startAnimationAudit(name: string, expectedDurationMs = 900) {
    if (!enabled) return () => { }

    const state: AnimationAuditState = {
        name,
        startedAt: performance.now(),
        expectedDurationMs,
        lastFrameAt: 0,
        frames: 0,
        jankFrames: 0,
        severeJankFrames: 0,
        maxFrameDeltaMs: 0,
        totalFrameDeltaMs: 0,
        rafId: null,
        stopped: false,
        startHeapMB: readHeapUsageMB()?.usedMB ?? null,
    }

    const finalize = buildAnimationFinalizer(state, 'completed')
    const manualStop = buildAnimationFinalizer(state, 'stopped')
    state.rafId = window.requestAnimationFrame(createAnimationFrameStep(state, finalize))

    return manualStop
}
