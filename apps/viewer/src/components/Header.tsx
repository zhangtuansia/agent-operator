/**
 * Header - App header with branding and controls
 */

import { Sun, Moon, X } from 'lucide-react'

/**
 * CoworkLogo - Pixel art "COWORK" text logo
 */
function CoworkLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 485 66"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15,1L60,1L60,14L15,14Z M0,14L15,14L15,27L0,27Z M60,14L75,14L75,27L60,27Z M0,27L15,27L15,40L0,40Z M0,40L15,40L15,53L0,53Z M60,40L75,40L75,53L60,53Z M15,53L60,53L60,66L15,66Z M97,1L142,1L142,14L97,14Z M82,14L97,14L97,27L82,27Z M142,14L157,14L157,27L142,27Z M82,27L97,27L97,40L82,40Z M142,27L157,27L157,40L142,40Z M82,40L97,40L97,53L82,53Z M142,40L157,40L157,53L142,53Z M97,53L142,53L142,66L97,66Z M164,1L179,1L179,14L164,14Z M224,1L239,1L239,14L224,14Z M164,14L179,14L179,27L164,27Z M224,14L239,14L239,27L224,27Z M164,27L179,27L179,40L164,40Z M194,27L209,27L209,40L194,40Z M224,27L239,27L239,40L224,40Z M164,40L179,40L179,53L164,53Z M194,40L209,40L209,53L194,53Z M224,40L239,40L239,53L224,53Z M179,53L194,53L194,66L179,66Z M209,53L224,53L224,66L209,66Z M261,1L306,1L306,14L261,14Z M246,14L261,14L261,27L246,27Z M306,14L321,14L321,27L306,27Z M246,27L261,27L261,40L246,40Z M306,27L321,27L321,40L306,40Z M246,40L261,40L261,53L246,53Z M306,40L321,40L321,53L306,53Z M261,53L306,53L306,66L261,66Z M328,1L388,1L388,14L328,14Z M328,14L343,14L343,27L328,27Z M388,14L403,14L403,27L388,27Z M328,27L388,27L388,40L328,40Z M328,40L343,40L343,53L328,53Z M373,40L388,40L388,53L373,53Z M328,53L343,53L343,66L328,66Z M388,53L403,53L403,66L388,66Z M410,1L425,1L425,14L410,14Z M470,1L485,1L485,14L470,14Z M410,14L425,14L425,27L410,27Z M455,14L470,14L470,27L455,27Z M410,27L455,27L455,40L410,40Z M410,40L425,40L425,53L410,53Z M455,40L470,40L470,53L455,53Z M410,53L425,53L425,66L410,66Z M470,53L485,53L485,66L470,66Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  )
}

interface HeaderProps {
  hasSession: boolean
  sessionTitle?: string
  isDark: boolean
  onToggleTheme: () => void
  onClear: () => void
}

export function Header({ hasSession, sessionTitle, isDark, onToggleTheme, onClear }: HeaderProps) {
  return (
    <header className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 py-3">
      {/* Logo - links to main site */}
      <a
        href="https://www.aicowork.chat"
        className="hover:opacity-80 transition-opacity"
        title="Cowork"
      >
        <CoworkLogo className="h-4 text-[#9570BE]" />
      </a>

      {/* Session title - centered */}
      <div className="flex justify-center">
        {sessionTitle && (
          <span className="text-sm font-semibold text-foreground truncate max-w-md">
            {sessionTitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Clear button (when session is loaded) */}
        {hasSession && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-md bg-background shadow-minimal text-foreground/40 hover:text-foreground/70 transition-colors"
            title="Clear session"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-md bg-background shadow-minimal text-foreground/40 hover:text-foreground/70 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  )
}
