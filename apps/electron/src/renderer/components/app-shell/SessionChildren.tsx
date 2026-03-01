import { formatDistanceToNowStrict } from "date-fns"
import type { Locale } from "date-fns"
import { cn } from "@/lib/utils"
import { useSessionListContext } from "@/context/SessionListContext"
import type { SessionMeta } from "@/atoms/sessions"
import { getSessionTitle, shortTimeLocale } from "@/utils/session"

interface SessionChildrenProps {
  childSessions: SessionMeta[]
}

export function SessionChildren({ childSessions }: SessionChildrenProps) {
  const ctx = useSessionListContext()
  if (childSessions.length === 0) return null

  return (
    <div className="relative mt-0.5 ml-12 mr-4 pl-3">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-foreground/15" />
      <div className="space-y-1 pl-2">
        {childSessions.map((child) => (
          <div
            key={child.id}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-[6px] text-left text-xs transition-colors cursor-pointer",
              ctx.selectedSessionId === child.id
                ? "bg-foreground/6 text-foreground"
                : "text-foreground/70 hover:bg-foreground/3 hover:text-foreground"
            )}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              ctx.onFocusZone()
              ctx.onSelectSessionById(child.id)
            }}
          >
            <span className="truncate min-w-0">{getSessionTitle(child)}</span>
            {child.lastMessageAt && (
              <span className="shrink-0 text-[10px] text-foreground/40 whitespace-nowrap">
                {formatDistanceToNowStrict(new Date(child.lastMessageAt), { locale: shortTimeLocale as Locale, roundingMethod: 'floor' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
