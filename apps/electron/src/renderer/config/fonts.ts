/**
 * Font Configuration
 *
 * Add your fonts here. The app will automatically load them and display in settings.
 *
 * ## For Google Fonts:
 *   - Set `googleFontsUrl` to the font URL (get from fonts.google.com)
 *
 * ## For Local Fonts:
 *   - Place font files (.ttf, .otf, .woff, .woff2) in /apps/electron/resources/fonts/
 *   - Set `localFiles` with the font file names and formats
 *
 * The 'system' font is always available and doesn't need to be defined here.
 */

export interface LocalFontFile {
  /** Font file name (e.g., 'MyFont-Regular.ttf') */
  src: string
  /** Font format */
  format: 'woff2' | 'woff' | 'truetype' | 'opentype'
  /** Font weight (e.g., '400', '500', '700') */
  weight?: string
  /** Font style (e.g., 'normal', 'italic') */
  style?: string
}

export interface FontConfig {
  /** Unique identifier for the font */
  id: string
  /** Display name shown in settings */
  name: string
  /** Native name (for non-English fonts, e.g., '思源黑体' for Noto Sans SC) */
  nativeName?: string
  /** CSS font-family value */
  fontFamily: string
  /** Google Fonts URL (optional - for web fonts) */
  googleFontsUrl?: string
  /** Local font files in /apps/electron/resources/fonts/ (optional) */
  localFiles?: LocalFontFile[]
  /** CSS font-feature-settings (optional) */
  fontFeatures?: string
  /** Whether to enable optical sizing (optional) */
  opticalSizing?: boolean
}

/**
 * Available fonts configuration
 *
 * Add your fonts to this array. Examples:
 *
 * === Google Font ===
 * {
 *   id: 'roboto',
 *   name: 'Roboto',
 *   fontFamily: '"Roboto", sans-serif',
 *   googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap',
 * }
 *
 * === Local Font (TTF/OTF files) ===
 * Place font files in /apps/electron/resources/fonts/ then add:
 * {
 *   id: 'my-custom-font',
 *   name: 'My Custom Font',
 *   nativeName: '我的字体',  // Optional: shows as "My Custom Font (我的字体)"
 *   fontFamily: '"My Custom Font", sans-serif',
 *   localFiles: [
 *     { src: 'MyCustomFont-Regular.ttf', format: 'truetype', weight: '400' },
 *     { src: 'MyCustomFont-Medium.ttf', format: 'truetype', weight: '500' },
 *     { src: 'MyCustomFont-Bold.ttf', format: 'truetype', weight: '700' },
 *   ],
 * }
 */
export const FONTS: FontConfig[] = [
  // Sans-serif fonts
  {
    id: 'inter',
    name: 'Inter',
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&display=swap',
    fontFeatures: '"cv01", "cv02", "cv03", "cv04", "case"',
    opticalSizing: true,
  },
  {
    id: 'geist',
    name: 'Geist',
    fontFamily: '"Geist", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    localFiles: [
      { src: 'Geist-VariableFont_wght.ttf', format: 'truetype', weight: '100 900', style: 'normal' },
    ],
  },
  {
    id: 'anthropic-sans',
    name: 'Anthropic Sans',
    fontFamily: '"Anthropic Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    localFiles: [
      { src: 'AnthropicSans-Romans-Variable-25x258.ttf', format: 'truetype', weight: '100 900', style: 'normal' },
      { src: 'AnthropicSans-Italics-Variable-25x258.ttf', format: 'truetype', weight: '100 900', style: 'italic' },
    ],
  },
  {
    id: 'anthropic-serif',
    name: 'Anthropic Serif',
    fontFamily: '"Anthropic Serif", Georgia, "Times New Roman", serif',
    localFiles: [
      { src: 'AnthropicSerif-Romans-Variable-25x258.ttf', format: 'truetype', weight: '100 900', style: 'normal' },
      { src: 'AnthropicSerif-Italics-Variable-25x258.ttf', format: 'truetype', weight: '100 900', style: 'italic' },
    ],
  },
  // Monospace fonts
  {
    id: 'geist-mono',
    name: 'Geist Mono',
    fontFamily: '"Geist Mono", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'GeistMono-VariableFont_wght.ttf', format: 'truetype', weight: '100 900', style: 'normal' },
    ],
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'JetBrainsMono-VariableFont_wght.ttf', format: 'truetype', weight: '100 900', style: 'normal' },
    ],
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    fontFamily: '"Fira Code", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'FiraCode-VariableFont_wght.ttf', format: 'truetype', weight: '300 700', style: 'normal' },
    ],
    fontFeatures: '"liga", "calt"', // Enable ligatures
  },
  {
    id: 'monaspace-neon',
    name: 'Monaspace Neon',
    fontFamily: '"Monaspace Neon", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'MonaspaceNeonVarVF[wght,wdth,slnt].ttf', format: 'truetype', weight: '200 800', style: 'normal' },
    ],
    fontFeatures: '"liga", "calt", "ss01"',
  },
  {
    id: 'monaspace-argon',
    name: 'Monaspace Argon',
    fontFamily: '"Monaspace Argon", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'MonaspaceArgonVarVF[wght,wdth,slnt].ttf', format: 'truetype', weight: '200 800', style: 'normal' },
    ],
    fontFeatures: '"liga", "calt", "ss01"',
  },
  {
    id: 'monaspace-krypton',
    name: 'Monaspace Krypton',
    fontFamily: '"Monaspace Krypton", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'MonaspaceKryptonVarVF[wght,wdth,slnt].ttf', format: 'truetype', weight: '200 800', style: 'normal' },
    ],
    fontFeatures: '"liga", "calt", "ss01"',
  },
  {
    id: 'monaspace-xenon',
    name: 'Monaspace Xenon',
    fontFamily: '"Monaspace Xenon", "SF Mono", Menlo, Monaco, monospace',
    localFiles: [
      { src: 'MonaspaceXenonVarVF[wght,wdth,slnt].ttf', format: 'truetype', weight: '200 800', style: 'normal' },
    ],
    fontFeatures: '"liga", "calt", "ss01"',
  },
]

/**
 * Get font by ID
 */
export function getFontById(id: string): FontConfig | undefined {
  return FONTS.find(f => f.id === id)
}

/**
 * Get display label for font (shows native name if available)
 */
export function getFontLabel(font: FontConfig): string {
  return font.nativeName ? `${font.name} (${font.nativeName})` : font.name
}

/**
 * System font configuration (always available)
 */
export const SYSTEM_FONT = {
  id: 'system',
  name: 'System',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
