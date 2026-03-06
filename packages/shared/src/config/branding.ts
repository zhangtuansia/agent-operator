/**
 * Centralized branding assets for Dazi
 * Used by OAuth callback pages
 */

export const COWORK_LOGO = [
  '  ████████  ██████  ██      ██ ██████  ██████  ██    ██',
  '██      ██ ██    ██ ██      ██ ██  ██  ██  ██  ██  ██  ',
  '██         ██    ██ ██  ██  ██ ██  ██  █████   ████    ',
  '██      ██ ██    ██ ██ ████ ██ ██  ██  ██  ██  ██  ██  ',
  '  ████████  ██████   ███  ███  ██████  ██  ██  ██    ██',
] as const;

/** Logo as a single string for HTML templates */
export const COWORK_LOGO_HTML = COWORK_LOGO.map((line) => line.trimEnd()).join('\n');

/** Session viewer base URL */
export const VIEWER_URL = 'https://share.aicowork.chat';

/** Public releases download page */
export const RELEASE_DOWNLOADS_URL = 'https://github.com/zhangtuansia/agent-operator/releases/latest';

// Legacy exports for backward compatibility
export const OPERATOR_LOGO = COWORK_LOGO;
export const OPERATOR_LOGO_HTML = COWORK_LOGO_HTML;
