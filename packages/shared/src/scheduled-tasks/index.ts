/**
 * Scheduler Service
 *
 * Emits SchedulerTick events every minute, aligned to minute boundaries.
 * Used by the automations system for cron-based automation matching.
 */

export { SchedulerService, type SchedulerTickPayload } from './scheduler-service.ts';
