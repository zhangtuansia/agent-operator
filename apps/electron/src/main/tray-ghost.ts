import { nativeImage } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { getBundledResourceDir } from './resource-paths'

export const GHOST_TRAY_FRAME_INTERVAL_MS = 140
const MAC_TRAY_ICON_SIZE = 18

function getGhostFramePaths(): string[] {
  const framesDir = getBundledResourceDir('tray-ghost-frames')
  if (!framesDir || !existsSync(framesDir)) {
    return []
  }

  return readdirSync(framesDir)
    .filter(fileName => fileName.endsWith('.png'))
    .sort()
    .map(fileName => join(framesDir, fileName))
}

function loadGhostFrame(framePath: string): Electron.NativeImage | null {
  const image = nativeImage.createFromPath(framePath)
  if (image.isEmpty()) {
    return null
  }

  const resizedImage = image.resize({
    width: MAC_TRAY_ICON_SIZE,
    height: MAC_TRAY_ICON_SIZE,
    quality: 'best',
  })
  resizedImage.setTemplateImage(false)
  return resizedImage
}

export function createGhostTrayFrames(): Electron.NativeImage[] {
  const frames: Electron.NativeImage[] = []

  for (const framePath of getGhostFramePaths()) {
    const frame = loadGhostFrame(framePath)
    if (frame) {
      frames.push(frame)
    }
  }

  return frames
}
