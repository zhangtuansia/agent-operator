import { motion } from 'motion/react'
import { CoworkAppIcon } from './icons/CoworkAppIcon'

interface SplashScreenProps {
  isExiting: boolean
  onExitComplete?: () => void
}

/**
 * SplashScreen - Shows app logo during initialization
 *
 * Displays centered logo on app background, fades out when app is fully ready.
 * On exit, the logo scales up and fades out quickly while the background fades slower.
 */
export function SplashScreen({ isExiting, onExitComplete }: SplashScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-splash flex items-center justify-center bg-background"
      initial={{ opacity: 1 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (isExiting && onExitComplete) {
          onExitComplete()
        }
      }}
    >
      <motion.div
        initial={{ scale: 1, opacity: 1 }}
        animate={{
          scale: isExiting ? 1.5 : 1,
          opacity: isExiting ? 0 : 1
        }}
        transition={{
          duration: 0.2,
          ease: [0.16, 1, 0.3, 1] // Exponential out curve
        }}
      >
        <CoworkAppIcon size={96} className="rounded-2xl shadow-lg" />
      </motion.div>
    </motion.div>
  )
}
