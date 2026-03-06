import { useEffect, useId, useRef, type SVGProps } from "react"
import { motion, useAnimationControls, useReducedMotion } from "framer-motion"

interface AiGenerate3dProps extends SVGProps<SVGSVGElement> {
  isHovered?: boolean
  isMenuOpen?: boolean
}

/**
 * Compact ghost icon for the app menu button.
 * Motion is intentionally subtle so the top bar stays calm:
 * - idle: very light breathing
 * - hover: blink once
 * - menu open: tiny spring feedback
 */
export function AiGenerate3d({
  isHovered = false,
  isMenuOpen = false,
  ...props
}: AiGenerate3dProps) {
  const id = useId().replace(/:/g, "")
  const ghostId = `ghost-${id}`
  const bodyGrad = `bodyGrad-${id}`
  const rainbow = `rainbow-${id}`
  const bottomGlow = `bottomGlow-${id}`
  const topHighlight = `topHighlight-${id}`
  const shadow = `shadow-${id}`
  const leftEyeControls = useAnimationControls()
  const rightEyeControls = useAnimationControls()
  const reduceMotion = useReducedMotion()
  const prevHoverRef = useRef(isHovered)
  const prevOpenRef = useRef(isMenuOpen)

  useEffect(() => {
    if (reduceMotion) {
      prevHoverRef.current = isHovered
      prevOpenRef.current = isMenuOpen
      return
    }

    const hoverTriggered = isHovered && !prevHoverRef.current
    const openTriggered = isMenuOpen && !prevOpenRef.current

    prevHoverRef.current = isHovered
    prevOpenRef.current = isMenuOpen

    if (!hoverTriggered && !openTriggered) {
      return
    }

    const blink = {
      ry: [15, 15, 2.25, 15],
      transition: {
        duration: 0.24,
        ease: "easeInOut",
        times: [0, 0.35, 0.58, 1],
      },
    }

    void leftEyeControls.start(blink)
    void rightEyeControls.start({
      ...blink,
      transition: {
        ...blink.transition,
        delay: hoverTriggered ? 0.015 : 0,
      },
    })
  }, [isHovered, isMenuOpen, leftEyeControls, reduceMotion, rightEyeControls])

  const idleAnimate = reduceMotion
    ? {}
    : {
        y: [0, -1.1, 0],
        rotate: [0, -0.8, 0],
      }

  const idleTransition = reduceMotion
    ? undefined
    : {
        duration: 3.8,
        ease: "easeInOut",
        repeat: Infinity,
      }

  const interactionAnimate = reduceMotion
    ? {}
    : {
        scale: isMenuOpen ? 1.055 : isHovered ? 1.028 : 1,
        y: isMenuOpen ? -1 : 0,
      }

  const interactionTransition = reduceMotion
    ? undefined
    : {
        type: "spring",
        stiffness: 360,
        damping: 24,
        mass: 0.42,
      }

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 230"
      fill="none"
      {...props}
    >
      <defs>
        <radialGradient id={bodyGrad} cx="50%" cy="45%" r="60%" fx="48%" fy="40%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#ece4f5" />
        </radialGradient>
        <linearGradient id={rainbow} x1="20%" y1="100%" x2="80%" y2="20%">
          <stop offset="0%" stopColor="#ffb3c6" stopOpacity="0.4" />
          <stop offset="25%" stopColor="#ffd6a5" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#caffbf" stopOpacity="0.3" />
          <stop offset="75%" stopColor="#9bf6ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d5aaff" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id={bottomGlow} cx="50%" cy="90%" r="45%">
          <stop offset="0%" stopColor="#ffaad4" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#aae8e8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={topHighlight} cx="50%" cy="25%" r="40%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow}>
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000000" floodOpacity="0.12" />
        </filter>
      </defs>
      <motion.g animate={idleAnimate} transition={idleTransition}>
        <motion.g animate={interactionAnimate} transition={interactionTransition}>
          <g filter={`url(#${shadow})`}>
            <path
              id={ghostId}
              d="M 100 14 C 48 14, 18 58, 18 105 L 18 175 Q 18 200, 38 190 Q 58 180, 68 200 Q 78 218, 100 200 Q 122 218, 132 200 Q 142 180, 162 190 Q 182 200, 182 175 L 182 105 C 182 58, 152 14, 100 14 Z"
              fill={`url(#${bodyGrad})`}
            />
            <use href={`#${ghostId}`} fill={`url(#${rainbow})`} />
            <use href={`#${ghostId}`} fill={`url(#${bottomGlow})`} />
            <use href={`#${ghostId}`} fill={`url(#${topHighlight})`} />
          </g>
          <motion.ellipse
            cx="80"
            cy="105"
            rx="12"
            ry="15"
            fill="#151525"
            animate={leftEyeControls}
            initial={{ ry: 15 }}
          />
          <motion.ellipse
            cx="120"
            cy="105"
            rx="12"
            ry="15"
            fill="#151525"
            animate={rightEyeControls}
            initial={{ ry: 15 }}
          />
        </motion.g>
      </motion.g>
    </motion.svg>
  )
}
