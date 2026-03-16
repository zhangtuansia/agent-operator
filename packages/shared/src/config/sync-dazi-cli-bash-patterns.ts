#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDaziCliReadOnlyBashPatterns } from './cli-domains.ts'

interface AllowedBashEntry {
  pattern: string
  comment?: string
}

interface PermissionsConfig {
  version?: string
  allowedBashPatterns?: AllowedBashEntry[]
  [key: string]: unknown
}

function isDaziCliPattern(entry: AllowedBashEntry): boolean {
  return typeof entry.pattern === 'string' && entry.pattern.startsWith('^(?:dazi-cli|cowork-cli)\\s')
}

function syncDaziCliPatterns(config: PermissionsConfig): PermissionsConfig {
  const patterns = config.allowedBashPatterns ?? []
  const firstIndex = patterns.findIndex(isDaziCliPattern)
  const withoutGenerated = patterns.filter(entry => !isDaziCliPattern(entry))
  const generated = getDaziCliReadOnlyBashPatterns()
  const insertAt = firstIndex >= 0 ? firstIndex : withoutGenerated.length

  return {
    ...config,
    allowedBashPatterns: [
      ...withoutGenerated.slice(0, insertAt),
      ...generated,
      ...withoutGenerated.slice(insertAt),
    ],
  }
}

function main() {
  const targetPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(process.cwd(), 'apps/electron/resources/permissions/default.json')

  const config = JSON.parse(readFileSync(targetPath, 'utf8')) as PermissionsConfig
  const nextConfig = syncDaziCliPatterns(config)
  writeFileSync(targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
  process.stdout.write(`Synced Dazi CLI bash patterns in ${targetPath}\n`)
}

if (import.meta.main) {
  main()
}
