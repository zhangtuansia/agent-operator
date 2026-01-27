/**
 * ProviderLogo - Display API provider logos
 *
 * Logos are stored in assets/apilogo/ as SVG files.
 * Falls back to a generic icon if logo is not found.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

// Import logos statically for Vite bundling
import claudeLogo from '@/assets/apilogo/Claude.svg'
import deepseekLogo from '@/assets/apilogo/deepseek.svg'
import minimaxLogo from '@/assets/apilogo/minimax.svg'
import openaiLogo from '@/assets/apilogo/openai.svg'
import geminiLogo from '@/assets/apilogo/gemini.svg'
import doubaoLogo from '@/assets/apilogo/doubao.svg'
import kimiLogo from '@/assets/apilogo/kimi.svg'
import glmLogo from '@/assets/apilogo/glm.svg'

// Map provider IDs to imported logos
const PROVIDER_LOGOS: Record<string, string> = {
  anthropic: claudeLogo,
  claude_oauth: claudeLogo,
  api_key: claudeLogo,
  codex: openaiLogo,
  deepseek: deepseekLogo,
  minimax: minimaxLogo,
  openai: openaiLogo,
  gemini: geminiLogo,
  doubao: doubaoLogo,
  kimi: kimiLogo,
  glm: glmLogo,
  // custom - will use fallback
}

interface ProviderLogoProps {
  provider: string
  className?: string
  size?: number
}

export function ProviderLogo({ provider, className, size = 20 }: ProviderLogoProps) {
  const logoSrc = PROVIDER_LOGOS[provider]

  if (!logoSrc) {
    // Fallback to a generic icon with first letter
    return (
      <div
        className={cn("flex items-center justify-center bg-muted rounded", className)}
        style={{ width: size, height: size }}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {provider.charAt(0).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <img
      src={logoSrc}
      alt={`${provider} logo`}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  )
}
