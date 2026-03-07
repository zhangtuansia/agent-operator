import { execFileSync } from 'child_process'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(SCRIPT_DIR, '..')
const OUTPUT_DIR = join(ROOT_DIR, 'apps/electron/resources/tray-ghost-frames')
const EYE_OPEN = 15
const EYE_HALF = 7
const EYE_CLOSED = 2
const EYE_SEQUENCE = [
  EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN,
  EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN,
  EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN, EYE_OPEN,
  EYE_OPEN, EYE_OPEN, EYE_HALF, EYE_CLOSED, EYE_HALF,
]
const FRAME_COUNT = EYE_SEQUENCE.length

function buildGhostSvg(frameIndex, eyeRy) {
  const ghostId = `ghost-${frameIndex}`
  const bodyGrad = `bodyGrad-${frameIndex}`
  const rainbow = `rainbow-${frameIndex}`
  const bottomGlow = `bottomGlow-${frameIndex}`
  const topHighlight = `topHighlight-${frameIndex}`
  const shadow = `shadow-${frameIndex}`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" fill="none">
      <defs>
        <radialGradient id="${bodyGrad}" cx="50%" cy="45%" r="60%" fx="48%" fy="40%">
          <stop offset="0%" stop-color="#ffffff"></stop>
          <stop offset="50%" stop-color="#f5f3ff"></stop>
          <stop offset="100%" stop-color="#ece4f5"></stop>
        </radialGradient>
        <linearGradient id="${rainbow}" x1="20%" y1="100%" x2="80%" y2="20%">
          <stop offset="0%" stop-color="#ffb3c6" stop-opacity="0.4"></stop>
          <stop offset="25%" stop-color="#ffd6a5" stop-opacity="0.25"></stop>
          <stop offset="50%" stop-color="#caffbf" stop-opacity="0.3"></stop>
          <stop offset="75%" stop-color="#9bf6ff" stop-opacity="0.35"></stop>
          <stop offset="100%" stop-color="#d5aaff" stop-opacity="0.3"></stop>
        </linearGradient>
        <radialGradient id="${bottomGlow}" cx="50%" cy="90%" r="45%">
          <stop offset="0%" stop-color="#ffaad4" stop-opacity="0.45"></stop>
          <stop offset="40%" stop-color="#aae8e8" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
        </radialGradient>
        <radialGradient id="${topHighlight}" cx="50%" cy="25%" r="40%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"></stop>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
        </radialGradient>
        <filter id="${shadow}">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000000" flood-opacity="0.12"></feDropShadow>
        </filter>
      </defs>
      <g style="transform: none; transform-origin: 50% 50%; transform-box: fill-box;">
        <g style="transform: none; transform-origin: 50% 50%; transform-box: fill-box;">
          <g filter="url(#${shadow})">
            <path
              id="${ghostId}"
              d="M 100 14 C 48 14, 18 58, 18 105 L 18 175 Q 18 200, 38 190 Q 58 180, 68 200 Q 78 218, 100 200 Q 122 218, 132 200 Q 142 180, 162 190 Q 182 200, 182 175 L 182 105 C 182 58, 152 14, 100 14 Z"
              fill="url(#${bodyGrad})"
            ></path>
            <use href="#${ghostId}" fill="url(#${rainbow})"></use>
            <use href="#${ghostId}" fill="url(#${bottomGlow})"></use>
            <use href="#${ghostId}" fill="url(#${topHighlight})"></use>
          </g>
          <ellipse cx="80" cy="105" rx="12" ry="${eyeRy}" fill="#151525"></ellipse>
          <ellipse cx="120" cy="105" rx="12" ry="${eyeRy}" fill="#151525"></ellipse>
        </g>
      </g>
    </svg>
  `.trim()
}

rmSync(OUTPUT_DIR, { recursive: true, force: true })
mkdirSync(OUTPUT_DIR, { recursive: true })

for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
  const svg = buildGhostSvg(frameIndex, EYE_SEQUENCE[frameIndex])
  const fileName = `frame-${String(frameIndex).padStart(2, '0')}`
  const svgPath = join(OUTPUT_DIR, `${fileName}.svg`)
  const pngPath = join(OUTPUT_DIR, `${fileName}.png`)

  writeFileSync(svgPath, svg, 'utf8')
  execFileSync('sips', ['-s', 'format', 'png', svgPath, '--out', pngPath], { stdio: 'ignore' })
  rmSync(svgPath, { force: true })
}

console.log(`Generated ${FRAME_COUNT} tray ghost frames in ${OUTPUT_DIR}`)
