/** Canonical config filename */
export const AUTOMATIONS_CONFIG_FILE = 'automations.json';

/** History log filename */
export const AUTOMATIONS_HISTORY_FILE = 'automations-history.jsonl';

/** Persistent retry queue filename */
export const AUTOMATIONS_RETRY_QUEUE_FILE = 'automations-retry-queue.jsonl';

/** Default HTTP method for webhook actions */
export const DEFAULT_WEBHOOK_METHOD = 'POST';

/** Maximum length for string fields written to automations-history.jsonl. */
export const HISTORY_FIELD_MAX_LENGTH = 2000;

/** Maximum runs to keep per automation matcher during history compaction. */
export const AUTOMATION_HISTORY_MAX_RUNS_PER_MATCHER = 50;

/** Global cap on total history entries. Triggers compaction when exceeded. */
export const AUTOMATION_HISTORY_MAX_ENTRIES = 500;
