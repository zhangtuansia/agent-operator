import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from "@/components/ui/styled-dropdown"
import { RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"
import { SquarePenRounded } from "./icons/SquarePenRounded"
import { PanelLeftRounded } from "./icons/PanelLeftRounded"
import { AiGenerate3d } from "./icons/AiGenerate3d"
import { TopBarButton } from "./ui/TopBarButton"
import { useLanguage } from "@/context/LanguageContext"
import { AppSettingsIcon, SETTINGS_ICONS } from "./icons/SettingsIcons"
import { SETTINGS_ITEMS } from "../../shared/menu-schema"
import type { SettingsSubpage } from "../../shared/types"

interface AppMenuProps {
  onNewChat: () => void
  onOpenSettings: () => void
  onOpenSettingsSubpage?: (subpage: SettingsSubpage) => void
  onOpenKeyboardShortcuts: () => void
  onOpenStoredUserPreferences: () => void
  onReset: () => void
  onBack?: () => void
  onForward?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onToggleSidebar?: () => void
  isSidebarVisible?: boolean
}

/**
 * AppMenu - Main application dropdown menu and top bar navigation
 *
 * Contains the App logo dropdown, back/forward navigation, and sidebar toggle.
 * All buttons use the consistent TopBarButton component.
 */
export function AppMenu({
  onNewChat,
  onOpenSettings,
  onOpenSettingsSubpage,
  onOpenKeyboardShortcuts,
  onOpenStoredUserPreferences,
  onReset,
  onBack,
  onForward,
  canGoBack = true,
  canGoForward = true,
  onToggleSidebar,
  isSidebarVisible = true,
}: AppMenuProps) {
  const { t } = useLanguage()

  const handleOpenSettingsItem = (subpage: SettingsSubpage) => {
    if (onOpenSettingsSubpage) {
      onOpenSettingsSubpage(subpage)
      return
    }
    // Backward-compatible fallbacks for legacy callers.
    if (subpage === "shortcuts") {
      onOpenKeyboardShortcuts()
      return
    }
    if (subpage === "preferences") {
      onOpenStoredUserPreferences()
      return
    }
    onOpenSettings()
  }

  const getSettingsShortcut = (subpage: SettingsSubpage): string | null => {
    if (subpage === "app") return "⌘,"
    if (subpage === "shortcuts") return "⌘/"
    return null
  }

  return (
    <div className="flex items-center gap-[5px] w-full">
      {/* Settings Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TopBarButton aria-label={t('appMenu.settings')}>
            <AiGenerate3d className="h-4 w-4 text-foreground/70" />
          </TopBarButton>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="start" minWidth="min-w-48">
          {/* Primary action */}
          <StyledDropdownMenuItem onClick={onNewChat}>
            <SquarePenRounded className="h-3.5 w-3.5" />
            {t('appMenu.newChat')}
            <DropdownMenuShortcut className="pl-6">⌘N</DropdownMenuShortcut>
          </StyledDropdownMenuItem>

          <StyledDropdownMenuSeparator />

          {/* Settings pages from shared schema */}
          {SETTINGS_ITEMS.map((item) => {
            const Icon = SETTINGS_ICONS[item.id] ?? AppSettingsIcon
            const shortcut = getSettingsShortcut(item.id)
            return (
              <StyledDropdownMenuItem
                key={item.id}
                onClick={() => handleOpenSettingsItem(item.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`settings.${item.id}`)}
                {shortcut ? (
                  <DropdownMenuShortcut className="pl-6">{shortcut}</DropdownMenuShortcut>
                ) : null}
              </StyledDropdownMenuItem>
            )
          })}

          <StyledDropdownMenuSeparator />

          {/* Reset App */}
          <StyledDropdownMenuItem onClick={onReset} variant="destructive">
            <RotateCcw className="h-3.5 w-3.5" />
            {t('appMenu.resetApp')}
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>

      {/* Spacer to push nav buttons right */}
      <div className="flex-1" />

      {/* Back Navigation */}
      <TopBarButton
        onClick={onBack}
        disabled={!canGoBack}
        aria-label={t('appMenu.goBack')}
      >
        <ChevronLeft className="h-[22px] w-[22px] text-foreground/70" strokeWidth={1.5} />
      </TopBarButton>

      {/* Forward Navigation */}
      <TopBarButton
        onClick={onForward}
        disabled={!canGoForward}
        aria-label={t('appMenu.goForward')}
      >
        <ChevronRight className="h-[22px] w-[22px] text-foreground/70" strokeWidth={1.5} />
      </TopBarButton>

      {/* Sidebar Toggle */}
      {onToggleSidebar && (
        <TopBarButton
          onClick={onToggleSidebar}
          aria-label={isSidebarVisible ? t('appMenu.hideSidebar') : t('appMenu.showSidebar')}
        >
          <PanelLeftRounded className="h-5 w-5 text-foreground/70" />
        </TopBarButton>
      )}
    </div>
  )
}
