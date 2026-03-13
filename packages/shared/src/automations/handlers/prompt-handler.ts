/**
 * PromptHandler - Processes prompt actions for App events
 *
 * Subscribes to App events and collects prompt actions to be executed.
 * Prompts are queued and delivered via callback for the caller to execute.
 */

import { createLogger } from '../../utils/debug.ts';
import type { EventBus, BaseEventPayload } from '../event-bus.ts';
import type { AutomationHandler, PromptHandlerOptions, AutomationsConfigProvider } from './types.ts';
import { APP_EVENTS, type AutomationEvent, type PendingPrompt, type AppEvent } from '../types.ts';
import { matcherMatches, buildEnvFromPayload, buildPendingPromptsForMatcher } from '../utils.ts';

const log = createLogger('prompt-handler');

// ============================================================================
// PromptHandler Implementation
// ============================================================================

export class PromptHandler implements AutomationHandler {
  private readonly options: PromptHandlerOptions;
  private readonly configProvider: AutomationsConfigProvider;
  private bus: EventBus | null = null;
  private boundHandler: ((event: AutomationEvent, payload: BaseEventPayload) => Promise<void>) | null = null;

  constructor(options: PromptHandlerOptions, configProvider: AutomationsConfigProvider) {
    this.options = options;
    this.configProvider = configProvider;
  }

  /**
   * Subscribe to App events on the bus.
   */
  subscribe(bus: EventBus): void {
    this.bus = bus;
    this.boundHandler = this.handleEvent.bind(this);
    bus.onAny(this.boundHandler);
    log.debug(`[PromptHandler] Subscribed to event bus`);
  }

  /**
   * Handle an event by processing matching prompt actions.
   */
  private async handleEvent(event: AutomationEvent, payload: BaseEventPayload): Promise<void> {
    // Only process App events for prompt actions
    if (!APP_EVENTS.includes(event as AppEvent)) {
      return;
    }

    const matchers = this.configProvider.getMatchersForEvent(event);
    if (matchers.length === 0) return;

    const env = buildEnvFromPayload(event, payload);
    const pendingPrompts: PendingPrompt[] = [];

    for (const matcher of matchers) {
      if (!matcherMatches(matcher, event, payload as unknown as Record<string, unknown>)) continue;
      pendingPrompts.push(...buildPendingPromptsForMatcher(matcher, env, this.options.sessionId));
    }

    if (pendingPrompts.length === 0) return;

    log.debug(`[PromptHandler] Processing ${pendingPrompts.length} prompts for ${event}`);

    // Deliver prompts via callback
    if (pendingPrompts.length > 0 && this.options.onPromptsReady) {
      log.debug(`[PromptHandler] Delivering ${pendingPrompts.length} prompts`);
      await this.options.onPromptsReady(pendingPrompts);
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.bus && this.boundHandler) {
      this.bus.offAny(this.boundHandler);
      this.boundHandler = null;
    }
    this.bus = null;
    log.debug(`[PromptHandler] Disposed`);
  }
}
