import { realpath } from 'fs/promises'
import { normalize, isAbsolute, join, dirname, sep } from 'path'
import { homedir, tmpdir } from 'os'

/**
 * Validates that a file path is within allowed directories to prevent path traversal attacks.
 * Allowed directories: user's home directory and /tmp
 *
 * Security measures:
 * 1. Normalizes path to resolve . and .. components
 * 2. Resolves symlinks to prevent symlink-based bypass
 * 3. Validates parent directories when file doesn't exist
 * 4. Blocks sensitive files even within allowed directories
 */
export async function validateFilePath(filePath: string): Promise<string> {
  let normalizedPath = normalize(filePath)

  if (normalizedPath.startsWith('~')) {
    normalizedPath = normalizedPath.replace(/^~/, homedir())
  }

  if (!isAbsolute(normalizedPath)) {
    throw new Error('Only absolute file paths are allowed')
  }

  const allowedDirs = [
    homedir(),
    '/tmp',
    '/var/folders',
    tmpdir(),
  ]

  const isPathAllowed = (pathToCheck: string): boolean => {
    return allowedDirs.some((dir) => pathToCheck === dir || pathToCheck.startsWith(`${dir}${sep}`))
  }

  let realPath: string
  try {
    realPath = await realpath(normalizedPath)
  } catch {
    let currentPath = normalizedPath
    let existingParent: string | null = null

    while (currentPath !== '/' && currentPath !== dirname(currentPath)) {
      currentPath = dirname(currentPath)
      try {
        existingParent = await realpath(currentPath)
        break
      } catch {
        // keep walking until we find an existing parent
      }
    }

    if (existingParent) {
      if (!isPathAllowed(existingParent)) {
        throw new Error('Access denied: file path is outside allowed directories')
      }
      const relativePart = normalizedPath.slice(currentPath.length)
      realPath = join(existingParent, relativePart)
    } else {
      realPath = normalizedPath
    }
  }

  if (!isPathAllowed(realPath)) {
    throw new Error('Access denied: file path is outside allowed directories')
  }

  const sensitivePatterns = [
    /\.ssh\//,
    /\.gnupg\//,
    /\.aws\/credentials/,
    /\.env$/,
    /\.env\./,
    /credentials\.json$/,
    /secrets?\./i,
    /\.pem$/,
    /\.key$/,
    /\.kube\/config/,
    /\.docker\/config\.json/,
  ]

  if (sensitivePatterns.some(pattern => pattern.test(realPath))) {
    throw new Error('Access denied: cannot read sensitive files')
  }

  return realPath
}
