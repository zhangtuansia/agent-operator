/**
 * Centralized branding assets for Agent Operator
 * Used by OAuth callback pages
 */

export const APP_LOGO = [
  '  ████████ █████████    ██████   ██████████ ██████████',
  '██████████ ██████████ ██████████ █████████  ██████████',
  '██████     ██████████ ██████████ ████████   ██████████',
  '██████████ ████████   ██████████ ███████      ██████  ',
  '  ████████ ████  ████ ████  ████ █████        ██████  ',
] as const;

/** @deprecated Use APP_LOGO instead */
export const CRAFT_LOGO = APP_LOGO;

/** Logo as a single string for HTML templates */
export const APP_LOGO_HTML = APP_LOGO.map((line) => line.trimEnd()).join('\n');

/** @deprecated Use APP_LOGO_HTML instead */
export const CRAFT_LOGO_HTML = APP_LOGO_HTML;

/** Session viewer base URL */
export const VIEWER_URL = 'https://agents.craft.do';
