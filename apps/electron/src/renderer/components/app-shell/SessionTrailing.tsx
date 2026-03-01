import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns"
import type { Locale } from "date-fns"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@agent-operator/ui"
import type { SessionMeta } from "@/atoms/sessions"
import { shortTimeLocale } from "@/utils/session"

interface SessionTrailingProps {
  item: SessionMeta
  childCount: number
  childrenOpen: boolean
  onToggleChildren: () => void
}

export function SessionTrailing({ item, childCount, childrenOpen, onToggleChildren }: SessionTrailingProps) {
  return (
    <>
      {item.lastMessageAt && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 text-[11px] text-foreground/40 whitespace-nowrap cursor-default">
              {formatDistanceToNowStrict(new Date(item.lastMessageAt), { locale: shortTimeLocale as Locale, roundingMethod: 'floor' })}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true })}
          </TooltipContent>
        </Tooltip>
      )}
      {childCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] bg-background shadow-minimal text-[10px] text-foreground/70 font-medium tabular-nums hover:text-foreground transition-colors"
          title={`${childrenOpen ? 'Hide' : 'Show'} child sessions`}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleChildren() }}
        >
          {childCount}
          <ChevronRight className={cn("h-2.5 w-2.5 transition-transform", childrenOpen && "rotate-90")} />
        </span>
      )}
    </>
  )
}
