import * as React from "react"
import { ChevronDown, Globe } from "lucide-react"
import { Spinner } from "@agent-operator/ui"

import { useTranslation } from "@/i18n"

import type { BrowserInstanceInfo } from "../../../shared/types"
import { getHostname, getThemeLuminance } from "./utils"

interface BrowserTabBadgeProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  instance: BrowserInstanceInfo
  isActive: boolean
}

export const BrowserTabBadge = React.forwardRef<HTMLButtonElement, BrowserTabBadgeProps>(
  function BrowserTabBadge({ instance, isActive, className, style, ...buttonProps }, ref) {
    const { t } = useTranslation()
    const hostname = getHostname(instance.url)
    const displayLabel =
      instance.title.trim() ||
      hostname ||
      (instance.url.startsWith("file:") ? t("browserTabStrip.localFile") : t("browserTabStrip.newTab"))

    const themeLuminance = instance.themeColor ? getThemeLuminance(instance.themeColor) : null
    const isDarkThemeColor = themeLuminance !== null && themeLuminance < 0.42
    const foregroundClass = instance.themeColor
      ? isDarkThemeColor
        ? "text-white/90 hover:bg-white/10"
        : "text-black/80 hover:bg-black/5"
      : "text-foreground hover:bg-foreground/[0.03]"

    const [faviconFailed, setFaviconFailed] = React.useState(false)

    React.useEffect(() => {
      setFaviconFailed(false)
    }, [instance.favicon])

    return (
      <button
        ref={ref}
        type="button"
        className={[
          "group flex h-[26px] max-w-[160px] cursor-pointer select-none items-center gap-1 rounded-lg pl-2.5 pr-1.5 text-[11px] leading-tight transition-colors titlebar-no-drag",
          isActive
            ? "bg-background-elevated shadow-middle ring-1 ring-foreground/8"
            : "bg-background shadow-minimal",
          foregroundClass,
          instance.agentControlActive ? "border border-accent" : "",
          className ?? "",
        ].join(" ")}
        style={{
          backgroundColor: instance.themeColor || undefined,
          transition: "background-color 200ms ease, border-color 200ms ease, box-shadow 180ms ease, transform 180ms ease",
          transform: isActive ? "translateY(-1px)" : undefined,
          ...style,
        }}
        aria-label={t("browserTabStrip.actionsFor", { label: displayLabel })}
        {...buttonProps}
      >
        <span className={`flex shrink-0 items-center justify-center ${isDarkThemeColor ? "h-3.5 w-3.5" : "h-3 w-3"}`}>
          {instance.isLoading ? (
            <Spinner className="text-[9px] leading-none" />
          ) : instance.favicon && !faviconFailed ? (
            isDarkThemeColor ? (
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-white/90 p-[1px] leading-none">
                <img
                  src={instance.favicon}
                  alt=""
                  className="block h-3 w-3 rounded-none object-cover"
                  onError={() => setFaviconFailed(true)}
                />
              </span>
            ) : (
              <img
                src={instance.favicon}
                alt=""
                className="block h-3 w-3 rounded-sm"
                onError={() => setFaviconFailed(true)}
              />
            )
          ) : (
            <Globe className="h-3 w-3" />
          )}
        </span>

        <span className="ml-0.5 truncate leading-[12px]">{displayLabel}</span>

        <span className="flex h-3 w-3 shrink-0 items-center justify-center opacity-55 transition-opacity group-hover:opacity-90">
          <ChevronDown className="h-2.5 w-2.5" />
        </span>
      </button>
    )
  }
)

BrowserTabBadge.displayName = "BrowserTabBadge"
