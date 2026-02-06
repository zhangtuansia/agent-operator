import type { BundledLanguage } from 'shiki'

export type ShikiModule = typeof import('shiki')

let shikiPromise: Promise<ShikiModule> | null = null

export async function loadShiki(): Promise<ShikiModule> {
  if (!shikiPromise) {
    shikiPromise = import('shiki')
  }
  return shikiPromise
}

export function isBundledLanguage(lang: string, shiki: ShikiModule): lang is BundledLanguage {
  return lang in shiki.bundledLanguages
}
