/**
 * Centralized branding assets for Agent Operator
 * Used by OAuth callback pages
 */

export const OPERATOR_LOGO = [
  '  ████████ █████████    ██████   ██████████ ██████████',
  '██████████ ██████████ ██████████ █████████  ██████████',
  '██████     ██████████ ██████████ ████████   ██████████',
  '██████████ ████████   ██████████ ███████      ██████  ',
  '  ████████ ████  ████ ████  ████ █████        ██████  ',
] as const;

/** Logo as a single string for HTML templates */
export const OPERATOR_LOGO_HTML = OPERATOR_LOGO.map((line) => line.trimEnd()).join('\n');

/** Session viewer base URL - TODO: Update when deploying own viewer */
export const VIEWER_URL = '';
