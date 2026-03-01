/**
 * Feature flags for controlling experimental or in-development features.
 * Set to `true` to enable, `false` to disable.
 *
 * These flags are compile-time constants — flip and rebuild to toggle.
 * For runtime-configurable settings, use config/storage.ts instead.
 */
export const FEATURE_FLAGS = {
  /** Enable source HTML template rendering via render_template tool */
  sourceTemplates: false,
  /** Enable Opus 4.6 fast mode (speed:"fast" + beta header). 6x pricing. */
  fastMode: false,
} as const;
