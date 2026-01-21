import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from "@/components/ui/styled-dropdown"
import { Settings, Keyboard, RotateCcw, User, ChevronLeft, ChevronRight } from "lucide-react"
import { SquarePenRounded } from "./icons/SquarePenRounded"
import { PanelLeftRounded } from "./icons/PanelLeftRounded"
import { TopBarButton } from "./ui/TopBarButton"
import { useLanguage } from "@/context/LanguageContext"

interface AppMenuProps {
  onNewChat: () => void
  onOpenSettings: () => void
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

  return (
    <div className="flex items-center gap-[5px] w-full">
      {/* Settings Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TopBarButton aria-label={t('appMenu.settings')}>
            <Settings className="h-4 w-4 text-foreground/70" />
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

          {/* Settings and preferences */}
          <StyledDropdownMenuItem onClick={onOpenSettings}>
            <Settings className="h-3.5 w-3.5" />
            {t('appMenu.settings')}
            <DropdownMenuShortcut className="pl-6">⌘,</DropdownMenuShortcut>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onClick={onOpenKeyboardShortcuts}>
            <Keyboard className="h-3.5 w-3.5" />
            {t('appMenu.keyboardShortcuts')}
            <DropdownMenuShortcut className="pl-6">⌘/</DropdownMenuShortcut>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onClick={onOpenStoredUserPreferences}>
            <User className="h-3.5 w-3.5" />
            {t('appMenu.storedUserPreferences')}
          </StyledDropdownMenuItem>

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
