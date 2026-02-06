import * as React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Spinner } from '@agent-operator/ui'
import { useTranslation } from '@/i18n'

/**
 * Processing message keys - translated at render time via i18n.
 * Keep this list in sync with i18n.processing entries.
 */
const PROCESSING_MESSAGE_KEYS = [
  'processing.thinking',
  'processing.analyzing',
  'processing.reasoning',
  'processing.processing',
  'processing.computing',
  'processing.considering',
  'processing.reflecting',
  'processing.deliberating',
  'processing.cogitating',
  'processing.ruminating',
  'processing.musing',
  'processing.workingOnIt',
  'processing.onIt',
  'processing.crunching',
  'processing.brewing',
  'processing.connectingDots',
  'processing.mullingOver',
  'processing.deepInThought',
  'processing.hmm',
  'processing.letMeSee',
  'processing.oneMoment',
  'processing.holdOn',
  'processing.bearWithMe',
  'processing.justASec',
  'processing.hangTight',
  'processing.gettingThere',
  'processing.almost',
  'processing.working',
  'processing.busyBusy',
  'processing.whirring',
  'processing.churning',
  'processing.percolating',
  'processing.simmering',
  'processing.cooking',
  'processing.baking',
  'processing.stirring',
  'processing.spinningUp',
  'processing.warmingUp',
  'processing.revving',
  'processing.buzzing',
  'processing.humming',
  'processing.ticking',
  'processing.clicking',
  'processing.whizzing',
  'processing.zooming',
  'processing.zipping',
  'processing.chugging',
  'processing.trucking',
  'processing.rolling',
] as const

/**
 * Format elapsed time: "45s" under a minute, "1:02" for 1+ minutes
 */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export interface ProcessingIndicatorProps {
  /** Start timestamp (persists across remounts) */
  startTime?: number
  /** Override cycling messages with explicit status (e.g., "Compacting...") */
  statusMessage?: string
}

/**
 * ProcessingIndicator - Shows cycling status messages with elapsed time
 * Matches TurnCard header layout for visual continuity
 */
export function ProcessingIndicator({ startTime, statusMessage }: ProcessingIndicatorProps) {
  const { t } = useTranslation()
  const processingMessages = React.useMemo(
    () => PROCESSING_MESSAGE_KEYS.map((key) => t(key)),
    [t]
  )
  const [elapsed, setElapsed] = React.useState(0)
  const [messageIndex, setMessageIndex] = React.useState(() =>
    Math.floor(Math.random() * PROCESSING_MESSAGE_KEYS.length)
  )

  // Update elapsed time every second using provided startTime
  React.useEffect(() => {
    const start = startTime || Date.now()
    // Set initial elapsed immediately
    setElapsed(Math.floor((Date.now() - start) / 1000))

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  // Cycle through messages every 10 seconds (only when not showing status)
  React.useEffect(() => {
    if (statusMessage) return  // Don't cycle when showing status
    const interval = setInterval(() => {
      setMessageIndex(prev => {
        // Pick a random different message
        let next = Math.floor(Math.random() * processingMessages.length)
        while (next === prev && processingMessages.length > 1) {
          next = Math.floor(Math.random() * processingMessages.length)
        }
        return next
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [processingMessages.length, statusMessage])

  // Use status message if provided, otherwise cycle through default messages
  const displayMessage = statusMessage || processingMessages[messageIndex] || t('processing.thinking')

  return (
    <div className="flex items-center gap-2 px-3 py-1 -mb-1 text-[13px] text-muted-foreground">
      {/* Spinner in same location as TurnCard chevron */}
      <div className="w-3 h-3 flex items-center justify-center shrink-0">
        <Spinner className="text-[10px]" />
      </div>
      {/* Label with crossfade animation on content change only */}
      <span className="relative h-5 flex items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={displayMessage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {displayMessage}
          </motion.span>
        </AnimatePresence>
        {elapsed >= 1 && (
          <span className="text-muted-foreground/60 ml-1">
            {formatElapsed(elapsed)}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * Scrolls to target element on mount, before browser paint.
 * Uses useLayoutEffect to ensure scroll happens before content is visible.
 */
export function ScrollOnMount({
  targetRef,
  onScroll
}: {
  targetRef: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
}) {
  React.useLayoutEffect(() => {
    targetRef.current?.scrollIntoView({ behavior: 'instant' })
    onScroll?.()
  }, [targetRef, onScroll])
  return null
}
