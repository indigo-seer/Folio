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

class PerformanceAuditor {
    private consumerCount = 0
    private teardownActiveMonitors: (() => void) | null = null

    private enabled = false
    private booted = false

    private lastEditorKeydownAt = 0
    private pendingTypingKeydownAt: number | null = null
    private typingLagSamples = 0
    private typingLagTotalMs = 0
    private typingLagMaxMs = 0

    private typingBurstEndsAt = 0
    private typingBurstRafId: number | null = null
    private typingBurstLastFrameAt = 0
    private typingBurstFrames = 0
    private typingBurstJankFrames = 0
    private typingBurstMaxFrameDeltaMs = 0
    private typingBurstTotalDeltaMs = 0
    private typingBurstCount = 0

    private memorySamples: MemorySample[] = []
    private lastMemoryInfoLogAt = 0
    private memoryUnsupportedLogged = false

    private calibratedFrameBudgetMs = DEFAULT_FRAME_BUDGET_MS
    private frameJankThresholdMs = 26
    private frameSevereJankThresholdMs = 40
    private calibrationRafId: number | null = null

    private recomputeFrameThresholds(frameBudgetMs: number) {
        this.calibratedFrameBudgetMs = frameBudgetMs
        this.frameJankThresholdMs = Math.max(frameBudgetMs * 1.6, 22)
        this.frameSevereJankThresholdMs = Math.max(frameBudgetMs * 2.5, 34)
    }

    private computeMedian(values: number[]): number {
        if (values.length === 0) return DEFAULT_FRAME_BUDGET_MS
        const sorted = [...values].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        if (sorted.length % 2 === 1) {
            return sorted[mid]
        }
        return (sorted[mid - 1] + sorted[mid]) / 2
    }

    private startFrameBudgetCalibration() {
        const deltas: number[] = []
        let previousAt = 0

        const step = (timestamp: number) => {
            if (!this.enabled) return

            if (previousAt > 0) {
                const delta = timestamp - previousAt
                if (delta > 4 && delta < 250) {
                    deltas.push(delta)
                }
            }
            previousAt = timestamp

            if (deltas.length >= 80) {
                const median = this.computeMedian(deltas)
                this.recomputeFrameThresholds(median)
                console.info(
                    `${PERF_PREFIX} frame budget calibrated: ${median.toFixed(1)}ms ` +
                    `(~${(1000 / median).toFixed(1)}fps). ` +
                    `jank>${this.frameJankThresholdMs.toFixed(1)}ms, severe>${this.frameSevereJankThresholdMs.toFixed(1)}ms`
                )
                this.calibrationRafId = null
                return
            }

            this.calibrationRafId = window.requestAnimationFrame(step)
        }

        this.calibrationRafId = window.requestAnimationFrame(step)
    }

    private isEnabledByConfig(): boolean {
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

    private readHeapUsageMB(): { usedMB: number; totalMB: number; limitMB: number } | null {
        const perf = performance as PerformanceWithMemory
        if (!perf.memory) return null
        return {
            usedMB: perf.memory.usedJSHeapSize / MB,
            totalMB: perf.memory.totalJSHeapSize / MB,
            limitMB: perf.memory.jsHeapSizeLimit / MB,
        }
    }

    private resetTypingBurstStats() {
        this.typingBurstLastFrameAt = 0
        this.typingBurstFrames = 0
        this.typingBurstJankFrames = 0
        this.typingBurstMaxFrameDeltaMs = 0
        this.typingBurstTotalDeltaMs = 0
    }

    private finalizeTypingBurst() {
        if (!this.enabled) return

        this.typingBurstCount += 1
        const avgFrameDeltaMs = this.typingBurstFrames > 1
            ? this.typingBurstTotalDeltaMs / (this.typingBurstFrames - 1)
            : 0
        const approxFps = avgFrameDeltaMs > 0 ? 1000 / avgFrameDeltaMs : 0
        const hadJank = this.typingBurstJankFrames > 0 || this.typingBurstMaxFrameDeltaMs >= this.frameSevereJankThresholdMs

        if (hadJank || this.typingBurstCount % 8 === 0) {
            const logger = hadJank ? console.warn : console.info
            logger(
                `${PERF_PREFIX} typing burst: frames=${this.typingBurstFrames}, ` +
                `jank=${this.typingBurstJankFrames}, maxFrame=${this.typingBurstMaxFrameDeltaMs.toFixed(1)}ms, ` +
                `avgFrame=${avgFrameDeltaMs.toFixed(1)}ms (~${approxFps.toFixed(1)}fps)`
            )
        }

        this.resetTypingBurstStats()
        this.typingBurstRafId = null
    }

    private runTypingBurstFrameAudit = (now: number) => {
        if (!this.enabled) {
            this.typingBurstRafId = null
            return
        }

        this.typingBurstFrames += 1

        if (this.typingBurstLastFrameAt > 0) {
            const frameDeltaMs = now - this.typingBurstLastFrameAt
            this.typingBurstTotalDeltaMs += frameDeltaMs
            this.typingBurstMaxFrameDeltaMs = Math.max(this.typingBurstMaxFrameDeltaMs, frameDeltaMs)

            if (frameDeltaMs >= this.frameJankThresholdMs) {
                this.typingBurstJankFrames += 1
            }
        }

        this.typingBurstLastFrameAt = now

        if (now < this.typingBurstEndsAt) {
            this.typingBurstRafId = window.requestAnimationFrame(this.runTypingBurstFrameAudit)
            return
        }

        this.finalizeTypingBurst()
    }

    private sampleMemory() {
        if (!this.enabled) return

        const heap = this.readHeapUsageMB()
        if (!heap) {
            if (!this.memoryUnsupportedLogged) {
                this.memoryUnsupportedLogged = true
                console.info(`${PERF_PREFIX} performance.memory is unavailable in this runtime.`)
            }
            return
        }

        const now = performance.now()
        this.memorySamples.push({
            at: now,
            usedMB: heap.usedMB,
            totalMB: heap.totalMB,
            limitMB: heap.limitMB,
        })

        this.memorySamples = this.memorySamples.filter(sample => now - sample.at <= MEMORY_TREND_WINDOW_MS)

        if (now - this.lastMemoryInfoLogAt >= 60000) {
            this.lastMemoryInfoLogAt = now
            console.info(
                `${PERF_PREFIX} heap: used=${heap.usedMB.toFixed(1)}MB / ` +
                `total=${heap.totalMB.toFixed(1)}MB (limit=${heap.limitMB.toFixed(0)}MB)`
            )
        }

        if (this.memorySamples.length < 6) return

        const usedValues = this.memorySamples.map(sample => sample.usedMB)
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

    private buildAnimationFinalizer(state: AnimationAuditState, reason: 'completed' | 'stopped') {
        return () => {
            if (!this.enabled || state.stopped) return
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

            const endHeapMB = this.readHeapUsageMB()?.usedMB ?? null
            const heapDeltaText = state.startHeapMB !== null && endHeapMB !== null
                ? `, heapDelta=${(endHeapMB - state.startHeapMB).toFixed(1)}MB`
                : ''

            const isConcerning = state.severeJankFrames > 0 || state.maxFrameDeltaMs >= 45
            const logger = isConcerning ? console.warn : console.info
            logger(
                `${PERF_PREFIX} ${state.name} (${reason}): duration=${elapsedMs.toFixed(0)}ms, ` +
                `frames=${state.frames}, jank=${state.jankFrames}, severeJank=${state.severeJankFrames}, ` +
                `maxFrame=${state.maxFrameDeltaMs.toFixed(1)}ms, avgFrame=${avgFrameDeltaMs.toFixed(1)}ms ` +
                `(~${approxFps.toFixed(1)}fps, budget=${this.calibratedFrameBudgetMs.toFixed(1)}ms)${heapDeltaText}`
            )
        }
    }

    private createAnimationFrameStep(state: AnimationAuditState, finalize: () => void) {
        const step = (timestamp: number) => {
            if (!this.enabled || state.stopped) return

            state.frames += 1

            if (state.lastFrameAt > 0) {
                const frameDeltaMs = timestamp - state.lastFrameAt
                state.maxFrameDeltaMs = Math.max(state.maxFrameDeltaMs, frameDeltaMs)
                state.totalFrameDeltaMs += frameDeltaMs

                if (frameDeltaMs >= this.frameJankThresholdMs) {
                    state.jankFrames += 1
                }
                if (frameDeltaMs >= this.frameSevereJankThresholdMs) {
                    state.severeJankFrames += 1
                }
            }

            state.lastFrameAt = timestamp

            if (timestamp - state.startedAt >= state.expectedDurationMs) {
                finalize()
                return
            }

            state.rafId = window.requestAnimationFrame(step)
        }
        return step
    }

    private bootMonitors() {
        this.enabled = this.isEnabledByConfig()
        this.booted = true
        this.memorySamples = []
        this.lastMemoryInfoLogAt = 0

        if (!this.enabled) return

        console.info(
            `${PERF_PREFIX} enabled. ` +
            `Use localStorage.setItem('${PERF_STORAGE_KEY}','1') to keep it on, or '0' to silence logs.`
        )
        this.recomputeFrameThresholds(DEFAULT_FRAME_BUDGET_MS)
        this.startFrameBudgetCalibration()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return
            if (event.ctrlKey || event.metaKey || event.altKey) return

            const target = event.target
            if (!(target instanceof Element)) return
            if (!target.closest('.ProseMirror')) return

            this.lastEditorKeydownAt = performance.now()
            this.pendingTypingKeydownAt = this.lastEditorKeydownAt
            this.typingBurstEndsAt = this.lastEditorKeydownAt + TYPING_BURST_WINDOW_MS

            if (this.typingBurstRafId === null) {
                this.resetTypingBurstStats()
                this.typingBurstRafId = window.requestAnimationFrame(this.runTypingBurstFrameAudit)
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
            this.sampleMemory()
        }, MEMORY_SAMPLE_INTERVAL_MS)

        this.sampleMemory()

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

        this.teardownActiveMonitors = () => {
            document.removeEventListener('keydown', handleKeyDown, true)
            window.clearInterval(eventLoopTimerId)
            window.clearInterval(memoryTimerId)

            if (this.typingBurstRafId !== null) {
                window.cancelAnimationFrame(this.typingBurstRafId)
                this.typingBurstRafId = null
            }
            if (this.calibrationRafId !== null) {
                window.cancelAnimationFrame(this.calibrationRafId)
                this.calibrationRafId = null
            }

            longTaskObserver?.disconnect()
            longTaskObserver = null
        }
    }

    private teardownMonitors() {
        this.teardownActiveMonitors?.()
        this.teardownActiveMonitors = null

        this.enabled = false
        this.booted = false
        this.lastEditorKeydownAt = 0
        this.pendingTypingKeydownAt = null
        this.typingLagSamples = 0
        this.typingLagTotalMs = 0
        this.typingLagMaxMs = 0
        this.memorySamples = []
        this.lastMemoryInfoLogAt = 0
        this.memoryUnsupportedLogged = false
        this.resetTypingBurstStats()
    }

    public startPerformanceAudit() {
        this.consumerCount += 1

        if (!this.booted) {
            this.bootMonitors()
        }

        return () => {
            this.consumerCount = Math.max(0, this.consumerCount - 1)
            if (this.consumerCount === 0) {
                this.teardownMonitors()
            }
        }
    }

    public recordTypingUpdate(pane: EditorPane, docSize: number) {
        if (!this.enabled || this.pendingTypingKeydownAt === null) return

        const now = performance.now()
        const lagMs = now - this.pendingTypingKeydownAt
        this.pendingTypingKeydownAt = null
        if (lagMs < 0 || lagMs > 2000) return

        this.typingLagSamples += 1
        this.typingLagTotalMs += lagMs
        this.typingLagMaxMs = Math.max(this.typingLagMaxMs, lagMs)

        if (lagMs >= TYPING_LAG_WARN_MS) {
            console.warn(
                `${PERF_PREFIX} typing lag: ${lagMs.toFixed(1)}ms in ${pane} pane (docSize=${docSize}).`
            )
        }

        if (this.typingLagSamples % TYPING_SUMMARY_EVERY === 0) {
            const avgLagMs = this.typingLagTotalMs / this.typingLagSamples
            console.info(
                `${PERF_PREFIX} typing summary (${this.typingLagSamples} samples): ` +
                `avg=${avgLagMs.toFixed(1)}ms, max=${this.typingLagMaxMs.toFixed(1)}ms`
            )
        }
    }

    public startAnimationAudit(name: string, expectedDurationMs = 900) {
        if (!this.enabled) return () => { }

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
            startHeapMB: this.readHeapUsageMB()?.usedMB ?? null,
        }

        const finalize = this.buildAnimationFinalizer(state, 'completed')
        const manualStop = this.buildAnimationFinalizer(state, 'stopped')
        state.rafId = window.requestAnimationFrame(this.createAnimationFrameStep(state, finalize))

        return manualStop
    }
}

// Export singleton pattern functions matching original signature
const globalPerfAuditor = new PerformanceAuditor()

export function startPerformanceAudit() {
    return globalPerfAuditor.startPerformanceAudit()
}

export function recordTypingUpdate(pane: EditorPane, docSize: number) {
    return globalPerfAuditor.recordTypingUpdate(pane, docSize)
}

export function startAnimationAudit(name: string, expectedDurationMs = 900) {
    return globalPerfAuditor.startAnimationAudit(name, expectedDurationMs)
}
