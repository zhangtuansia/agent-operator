/**
 * Memory Monitor Utility (Development Only)
 *
 * Provides memory usage monitoring and logging to help identify memory leaks.
 * Only active in development mode.
 */

interface MemorySnapshot {
  timestamp: number
  usedMB: number
  totalMB: number
  limitMB: number
}

interface MemoryMonitorConfig {
  /** Interval in milliseconds for memory checks (default: 30000) */
  intervalMs?: number
  /** Log to console (default: true) */
  logToConsole?: boolean
  /** Warn threshold in MB (default: 500) */
  warnThresholdMB?: number
  /** Alert threshold in MB (default: 1000) */
  alertThresholdMB?: number
}

let monitorInterval: ReturnType<typeof setInterval> | null = null
const snapshots: MemorySnapshot[] = []
const MAX_SNAPSHOTS = 100

/**
 * Get current memory usage information
 */
function getMemoryInfo(): MemorySnapshot | null {
  // performance.memory is Chrome-specific and not in standard TypeScript types
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number
      totalJSHeapSize: number
      jsHeapSizeLimit: number
    }
  }

  if (!perf.memory) {
    return null
  }

  return {
    timestamp: Date.now(),
    usedMB: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
    totalMB: Math.round(perf.memory.totalJSHeapSize / 1024 / 1024),
    limitMB: Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024),
  }
}

/**
 * Setup memory monitoring (development only)
 *
 * Logs memory usage at regular intervals and warns when thresholds are exceeded.
 */
export function setupMemoryMonitor(config: MemoryMonitorConfig = {}): () => void {
  // Only run in development
  if (process.env.NODE_ENV !== 'development') {
    return () => {}
  }

  const {
    intervalMs = 30000,
    logToConsole = true,
    warnThresholdMB = 500,
    alertThresholdMB = 1000,
  } = config

  // Clean up any existing monitor
  if (monitorInterval) {
    clearInterval(monitorInterval)
  }

  console.log('[MemoryMonitor] Started memory monitoring')

  monitorInterval = setInterval(() => {
    const info = getMemoryInfo()
    if (!info) return

    // Store snapshot
    snapshots.push(info)
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.shift()
    }

    // Calculate trend if we have history
    const trend = snapshots.length >= 2
      ? info.usedMB - snapshots[snapshots.length - 2].usedMB
      : 0
    const trendStr = trend >= 0 ? `+${trend}` : `${trend}`

    if (logToConsole) {
      const logFn = info.usedMB >= alertThresholdMB ? console.error
        : info.usedMB >= warnThresholdMB ? console.warn
        : console.log

      logFn('[MemoryMonitor]', {
        used: `${info.usedMB}MB`,
        total: `${info.totalMB}MB`,
        limit: `${info.limitMB}MB`,
        trend: `${trendStr}MB`,
        utilization: `${Math.round(info.usedMB / info.limitMB * 100)}%`,
      })
    }

    // Alert on high memory
    if (info.usedMB >= alertThresholdMB) {
      console.error(`[MemoryMonitor] HIGH MEMORY ALERT: ${info.usedMB}MB used`)
    }
  }, intervalMs)

  // Return cleanup function
  return () => {
    if (monitorInterval) {
      clearInterval(monitorInterval)
      monitorInterval = null
      console.log('[MemoryMonitor] Stopped memory monitoring')
    }
  }
}

/**
 * Get memory snapshots history
 */
export function getMemorySnapshots(): readonly MemorySnapshot[] {
  return snapshots
}

/**
 * Get current memory usage (one-time check)
 */
export function getCurrentMemoryUsage(): MemorySnapshot | null {
  return getMemoryInfo()
}

/**
 * Log current memory usage with a label
 */
export function logMemoryUsage(label: string): void {
  if (process.env.NODE_ENV !== 'development') return

  const info = getMemoryInfo()
  if (info) {
    console.log(`[MemoryMonitor:${label}]`, {
      used: `${info.usedMB}MB`,
      total: `${info.totalMB}MB`,
    })
  }
}

/**
 * Request garbage collection hint (development only, requires --expose-gc flag)
 */
export function requestGC(): void {
  if (process.env.NODE_ENV !== 'development') return

  // gc is only available with --expose-gc flag
  const globalWithGC = globalThis as typeof globalThis & { gc?: () => void }
  if (typeof globalWithGC.gc === 'function') {
    console.log('[MemoryMonitor] Requesting GC...')
    globalWithGC.gc()
  }
}
