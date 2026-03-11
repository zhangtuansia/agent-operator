import * as React from 'react'

export interface BrowserEmptyPromptSample {
  short: string
  full: string
}

export interface BrowserEmptyStateCardProps {
  title: string
  description: string
  prompts?: readonly BrowserEmptyPromptSample[]
  showExamplePrompts?: boolean
  showSafetyHint?: boolean
  safetyHint?: string
  onPromptSelect?: (prompt: BrowserEmptyPromptSample) => void
}

export function BrowserEmptyStateCard({
  title,
  description,
  prompts = [],
  showExamplePrompts = true,
  showSafetyHint = true,
  safetyHint = 'Dazi only controls browser windows when you ask it to.',
  onPromptSelect,
}: BrowserEmptyStateCardProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="h-auto w-full max-w-[700px] overflow-hidden rounded-[8px] border border-border/30 bg-background shadow-minimal">
        <div className="flex items-center border-b border-border/30 bg-muted/20 px-4 py-3 select-none">
          <h3 className="text-[13px] font-medium tracking-tight text-foreground">
            {title}
          </h3>
        </div>

        <div className="px-[22px] py-3 pr-[16px] text-sm">
          <p className="leading-relaxed text-foreground/65">
            {description}
          </p>

          {showExamplePrompts && prompts.length > 0 && (
            <div className="mt-3.5 space-y-1.5">
              {prompts.map((sample, index) => (
                <button
                  key={sample.short}
                  type="button"
                  title={sample.full}
                  onClick={() => onPromptSelect?.(sample)}
                  className="flex h-8 max-w-full w-fit cursor-pointer items-center gap-1 rounded-[6px] bg-background px-2.5 text-left shadow-minimal transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="w-4 shrink-0 text-[11px] tabular-nums text-foreground/40">{index + 1}.</span>
                  <span className="truncate text-[12px] text-foreground/70">{sample.short}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {showSafetyHint && (
          <div className="flex items-center gap-2 border-t border-border/30 bg-muted/20 px-4 py-2.5 text-[13px] text-foreground/55">
            <p>{safetyHint}</p>
          </div>
        )}
      </div>
    </div>
  )
}
