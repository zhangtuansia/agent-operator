import * as React from "react"
import {
  AppWindow,
  Globe,
  Plus,
} from "lucide-react"

import { AppMenu } from "@/components/AppMenu"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from "@/components/ui/styled-dropdown"
import { TopBarButton } from "@/components/ui/TopBarButton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SquarePenRounded } from "@/components/icons/SquarePenRounded"
import { PanelLeftRounded } from "@/components/icons/PanelLeftRounded"
import { BrowserTabStrip } from "../browser/BrowserTabStrip"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import { isMac } from "@/lib/platform"
import { useTranslation } from "@/i18n"
import type { Workspace, SettingsSubpage } from "../../../shared/types"

const RIGHT_SLOT_FULL_BADGES_THRESHOLD = 420
const RIGHT_SLOT_TWO_BADGES_THRESHOLD = 300

interface TopBarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelectWorkspace: (workspaceId: string, openInNewWindow?: boolean) => void
  workspaceUnreadMap?: Record<string, boolean>
  onWorkspaceCreated?: (workspace: Workspace) => void
  activeSessionId?: string | null
  onNewChat: () => void
  onNewWindow?: () => void
  onOpenSettings: () => void
  onOpenSettingsSubpage: (subpage: SettingsSubpage) => void
  onOpenKeyboardShortcuts: () => void
  onOpenStoredUserPreferences: () => void
  onReset: () => void
  onBack: () => void
  onForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  onToggleSidebar: () => void
  isSidebarVisible: boolean
  onAddSessionPanel: () => void
  onAddBrowserPanel?: () => void
  canAddPanel?: boolean
}

export function TopBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  workspaceUnreadMap,
  onWorkspaceCreated,
  activeSessionId,
  onNewChat,
  onNewWindow,
  onOpenSettings,
  onOpenSettingsSubpage,
  onOpenKeyboardShortcuts,
  onOpenStoredUserPreferences,
  onReset,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onToggleSidebar,
  isSidebarVisible,
  onAddSessionPanel,
  onAddBrowserPanel,
  canAddPanel = true,
}: TopBarProps) {
  const { t } = useTranslation()
  const menuLeftPadding = isMac ? 86 : 12
  const [panelMenuOpen, setPanelMenuOpen] = React.useState(false)
  const [maxVisibleBrowserBadges, setMaxVisibleBrowserBadges] = React.useState(3)
  const rightSlotRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const slotEl = rightSlotRef.current
    if (!slotEl) return

    let frame = 0
    const updateBadgeDensity = () => {
      const slotWidth = slotEl.getBoundingClientRect().width
      const nextMaxVisibleBadges =
        slotWidth >= RIGHT_SLOT_FULL_BADGES_THRESHOLD
          ? 3
          : slotWidth >= RIGHT_SLOT_TWO_BADGES_THRESHOLD
            ? 2
            : 1

      setMaxVisibleBrowserBadges((prev) => (prev === nextMaxVisibleBadges ? prev : nextMaxVisibleBadges))
    }

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateBadgeDensity)
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(slotEl)
    updateBadgeDensity()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [activeWorkspaceId, workspaces.length])

  return (
    <div className="fixed top-0 left-0 right-0 h-[48px] z-panel titlebar-drag-region">
      <div className="flex h-full w-full items-center justify-between gap-2">
        <div
          className="pointer-events-auto flex min-w-0 flex-1 items-center gap-0.5"
          style={{ paddingLeft: menuLeftPadding }}
        >
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <TopBarButton
                  onClick={onToggleSidebar}
                  aria-label={isSidebarVisible ? t("appMenu.hideSidebar") : t("appMenu.showSidebar")}
                >
                  <PanelLeftRounded className="h-[18px] w-[18px] text-foreground/70" />
                </TopBarButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{isSidebarVisible ? t("appMenu.hideSidebar") : t("appMenu.showSidebar")}</TooltipContent>
            </Tooltip>

            <AppMenu
              className="shrink-0"
              onNewChat={onNewChat}
              onOpenSettings={onOpenSettings}
              onOpenSettingsSubpage={onOpenSettingsSubpage}
              onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
              onOpenStoredUserPreferences={onOpenStoredUserPreferences}
              onReset={onReset}
              onBack={onBack}
              onForward={onForward}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
            />
          </div>

          <div className="ml-1 flex w-[clamp(220px,42vw,640px)] min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1 titlebar-no-drag">
              <WorkspaceSwitcher
                variant="topbar"
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSelect={onSelectWorkspace}
                onWorkspaceCreated={onWorkspaceCreated}
                workspaceUnreadMap={workspaceUnreadMap}
              />
            </div>
          </div>
        </div>

        <div
          ref={rightSlotRef}
          className="pointer-events-auto flex min-w-0 shrink-0 items-center justify-end gap-1 titlebar-no-drag"
          style={{ paddingRight: 12 }}
        >
          <div className="min-w-0">
            <BrowserTabStrip activeSessionId={activeSessionId} maxVisibleBadges={maxVisibleBrowserBadges} />
          </div>

          {canAddPanel && (
            <DropdownMenu open={panelMenuOpen} onOpenChange={setPanelMenuOpen}>
              <DropdownMenuTrigger asChild>
                <TopBarButton aria-label={t("topBar.addPanel")} isActive={panelMenuOpen} className="ml-1 h-[26px] w-[26px] rounded-lg">
                  <Plus className="h-4 w-4 text-foreground/50" strokeWidth={1.5} />
                </TopBarButton>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end" minWidth="min-w-56">
                <StyledDropdownMenuItem onClick={onAddSessionPanel}>
                  <SquarePenRounded className="h-3.5 w-3.5" />
                  {t("topBar.newSessionInPanel")}
                </StyledDropdownMenuItem>
                {onAddBrowserPanel && (
                  <StyledDropdownMenuItem onClick={onAddBrowserPanel}>
                    <Globe className="h-3.5 w-3.5" />
                    {t("topBar.newBrowserWindow")}
                  </StyledDropdownMenuItem>
                )}
                <StyledDropdownMenuItem onClick={() => (onNewWindow ? onNewWindow() : window.electronAPI.newWindow())}>
                  <AppWindow className="h-3.5 w-3.5" />
                  {t("appMenu.newWindow")}
                </StyledDropdownMenuItem>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}
