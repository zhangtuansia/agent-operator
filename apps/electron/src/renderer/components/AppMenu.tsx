import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
  DropdownMenuSub,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
  StyledDropdownMenuSubTrigger,
  StyledDropdownMenuSubContent,
} from "@/components/ui/styled-dropdown"
import {
  RotateCcw,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  Pencil,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw as ZoomReset,
  AppWindow,
  Minimize2,
  Maximize2,
  Settings,
  HelpCircle,
  Keyboard,
} from "lucide-react"
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
 * Contains the App logo dropdown with nested submenus:
 * - File actions (New Chat, New Window)
 * - Edit submenu (Undo, Redo, Cut, Copy, Paste, Select All)
 * - View submenu (Zoom In/Out/Reset)
 * - Window submenu (Minimize, Maximize)
 * - Settings submenu (all settings sub-pages)
 * - Help submenu (Keyboard Shortcuts)
 * - Reset
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

  const api = window.electronAPI

  return (
    <div className="flex items-center gap-[5px] w-full">
      {/* App Logo Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TopBarButton aria-label={t('appMenu.settings')}>
            <AiGenerate3d className="h-4 w-4 text-foreground/70" />
          </TopBarButton>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="start" minWidth="min-w-48">
          {/* File actions */}
          <StyledDropdownMenuItem onClick={onNewChat}>
            <SquarePenRounded className="h-3.5 w-3.5" />
            {t('appMenu.newChat')}
            <DropdownMenuShortcut className="pl-6">⌘N</DropdownMenuShortcut>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem onClick={() => api.newWindow()}>
            <AppWindow className="h-3.5 w-3.5" />
            {t('appMenu.newWindow')}
            <DropdownMenuShortcut className="pl-6">⌘⇧N</DropdownMenuShortcut>
          </StyledDropdownMenuItem>

          <StyledDropdownMenuSeparator />

          {/* Edit submenu */}
          <DropdownMenuSub>
            <StyledDropdownMenuSubTrigger>
              <Pencil className="h-3.5 w-3.5" />
              {t('appMenu.edit')}
            </StyledDropdownMenuSubTrigger>
            <StyledDropdownMenuSubContent>
              <StyledDropdownMenuItem onClick={() => api.menuUndo()}>
                <Undo2 className="h-3.5 w-3.5" />
                {t('appMenu.undo')}
                <DropdownMenuShortcut className="pl-6">⌘Z</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuRedo()}>
                <Redo2 className="h-3.5 w-3.5" />
                {t('appMenu.redo')}
                <DropdownMenuShortcut className="pl-6">⌘⇧Z</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuSeparator />
              <StyledDropdownMenuItem onClick={() => api.menuCut()}>
                <Scissors className="h-3.5 w-3.5" />
                {t('appMenu.cut')}
                <DropdownMenuShortcut className="pl-6">⌘X</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuCopy()}>
                <Copy className="h-3.5 w-3.5" />
                {t('appMenu.copy')}
                <DropdownMenuShortcut className="pl-6">⌘C</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuPaste()}>
                <ClipboardPaste className="h-3.5 w-3.5" />
                {t('appMenu.paste')}
                <DropdownMenuShortcut className="pl-6">⌘V</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuSeparator />
              <StyledDropdownMenuItem onClick={() => api.menuSelectAll()}>
                <TextSelect className="h-3.5 w-3.5" />
                {t('appMenu.selectAll')}
                <DropdownMenuShortcut className="pl-6">⌘A</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
            </StyledDropdownMenuSubContent>
          </DropdownMenuSub>

          {/* View submenu */}
          <DropdownMenuSub>
            <StyledDropdownMenuSubTrigger>
              <Eye className="h-3.5 w-3.5" />
              {t('appMenu.view')}
            </StyledDropdownMenuSubTrigger>
            <StyledDropdownMenuSubContent>
              <StyledDropdownMenuItem onClick={() => api.menuZoomIn()}>
                <ZoomIn className="h-3.5 w-3.5" />
                {t('appMenu.zoomIn')}
                <DropdownMenuShortcut className="pl-6">⌘+</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuZoomOut()}>
                <ZoomOut className="h-3.5 w-3.5" />
                {t('appMenu.zoomOut')}
                <DropdownMenuShortcut className="pl-6">⌘-</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuZoomReset()}>
                <ZoomReset className="h-3.5 w-3.5" />
                {t('appMenu.resetZoom')}
                <DropdownMenuShortcut className="pl-6">⌘0</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
            </StyledDropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Window submenu */}
          <DropdownMenuSub>
            <StyledDropdownMenuSubTrigger>
              <AppWindow className="h-3.5 w-3.5" />
              {t('appMenu.window')}
            </StyledDropdownMenuSubTrigger>
            <StyledDropdownMenuSubContent>
              <StyledDropdownMenuItem onClick={() => api.menuMinimize()}>
                <Minimize2 className="h-3.5 w-3.5" />
                {t('appMenu.minimize')}
                <DropdownMenuShortcut className="pl-6">⌘M</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onClick={() => api.menuMaximize()}>
                <Maximize2 className="h-3.5 w-3.5" />
                {t('appMenu.maximize')}
              </StyledDropdownMenuItem>
            </StyledDropdownMenuSubContent>
          </DropdownMenuSub>

          <StyledDropdownMenuSeparator />

          {/* Settings submenu */}
          <DropdownMenuSub>
            <StyledDropdownMenuSubTrigger>
              <Settings className="h-3.5 w-3.5" />
              {t('sidebar.settings')}
            </StyledDropdownMenuSubTrigger>
            <StyledDropdownMenuSubContent>
              <StyledDropdownMenuItem onClick={onOpenSettings}>
                <Settings className="h-3.5 w-3.5" />
                {t('appMenu.settings')}
                <DropdownMenuShortcut className="pl-6">⌘,</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
              <StyledDropdownMenuSeparator />
              {SETTINGS_ITEMS.map((item) => {
                const Icon = SETTINGS_ICONS[item.id] ?? AppSettingsIcon
                return (
                  <StyledDropdownMenuItem
                    key={item.id}
                    onClick={() => handleOpenSettingsItem(item.id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(`settings.${item.id}`)}
                  </StyledDropdownMenuItem>
                )
              })}
            </StyledDropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Help submenu */}
          <DropdownMenuSub>
            <StyledDropdownMenuSubTrigger>
              <HelpCircle className="h-3.5 w-3.5" />
              {t('appMenu.help')}
            </StyledDropdownMenuSubTrigger>
            <StyledDropdownMenuSubContent>
              <StyledDropdownMenuItem onClick={onOpenKeyboardShortcuts}>
                <Keyboard className="h-3.5 w-3.5" />
                {t('appMenu.keyboardShortcuts')}
                <DropdownMenuShortcut className="pl-6">⌘/</DropdownMenuShortcut>
              </StyledDropdownMenuItem>
            </StyledDropdownMenuSubContent>
          </DropdownMenuSub>

          <StyledDropdownMenuSeparator />

          {/* Reset App */}
          <StyledDropdownMenuItem onClick={onReset} variant="destructive">
            <RotateCcw className="h-3.5 w-3.5" />
            {t('appMenu.resetApp')}
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>

      {/* Spacer to push sidebar toggle right */}
      <div className="flex-1" />

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
