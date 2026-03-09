import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface PanelHeaderCenterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  tooltip?: string
}

export const PanelHeaderCenterButton = React.forwardRef<HTMLButtonElement, PanelHeaderCenterButtonProps>(
  ({ icon, tooltip, className, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex items-center justify-center rounded-[6px] p-1.5 titlebar-no-drag shrink-0",
          "border border-foreground/8 bg-background shadow-minimal opacity-70 transition-opacity hover:opacity-100",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-40",
          className
        )}
        {...props}
      >
        {icon}
      </button>
    )

    if (!tooltip) return button

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }
)

PanelHeaderCenterButton.displayName = "PanelHeaderCenterButton"
