/**
 * Session title generator utility.
 * Uses Claude Agent SDK query() for all auth types (API Key, Claude OAuth).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getDefaultOptions } from '../agent/options.ts';
import { SUMMARIZATION_MODEL } from '../config/models.ts';

function normalizeTitle(raw: string): string {
  // Keep first line and collapse whitespace so we don't reject otherwise good output.
  const singleLine = raw.split('\n')[0]?.trim() ?? '';
  const collapsed = singleLine.replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '');
  if (!collapsed) return '';
  return collapsed.length <= 100 ? collapsed : `${collapsed.slice(0, 97).trimEnd()}...`;
}

async function queryTitle(prompt: string): Promise<string> {
  const defaultOptions = getDefaultOptions();
  const options = {
    ...defaultOptions,
    model: SUMMARIZATION_MODEL,
    maxTurns: 1,
  };

  let title = '';
  let lastResultText = '';

  for await (const message of query({ prompt, options })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          title += block.text;
        }
      }
      continue;
    }

    // Some SDK failures arrive as `result` without throwing.
    if (message.type === 'result') {
      const resultPayload = (
        message.subtype === 'success'
          ? message.result
          : message.errors.length > 0
            ? message.errors.join('; ')
            : message.subtype
      ).trim();
      if (resultPayload) {
        lastResultText = resultPayload;
      }
    }
  }

  const normalized = normalizeTitle(title);
  if (normalized) return normalized;

  if (lastResultText) {
    throw new Error(`title generator returned no assistant text (result=${lastResultText})`);
  }

  throw new Error('title generator returned empty assistant text');
}

/**
 * Generate a task-focused title (2-5 words) from the user's first message.
 * Extracts what the user is trying to accomplish, framing conversations as tasks.
 * Uses SDK query() which handles all auth types via getDefaultOptions().
 *
 * @param userMessage - The user's first message
 * @returns Generated task title, or null if generation fails
 */
export async function generateSessionTitle(
  userMessage: string
): Promise<string | null> {
  try {
    const userSnippet = userMessage.slice(0, 500);

    const prompt = [
      'What is the user trying to do? Reply with ONLY a short task description (2-5 words).',
      'Start with a verb. Use plain text only - no markdown.',
      'Examples: "Fix authentication bug", "Add dark mode", "Refactor API layer", "Explain codebase structure"',
      '',
      'User: ' + userSnippet,
      '',
      'Task:',
    ].join('\n');

    return await queryTitle(prompt);
  } catch (error) {
    console.error('[title-generator] Failed to generate title:', error);
    throw error;
  }
}

/**
 * Regenerate a session title based on recent messages.
 * Uses the most recent user messages to capture what the session has evolved into,
 * rather than just the initial topic.
 *
 * @param recentUserMessages - The last few user messages (most recent context)
 * @param lastAssistantResponse - The most recent assistant response
 * @returns Generated title reflecting current session focus, or null if generation fails
 */
export async function regenerateSessionTitle(
  recentUserMessages: string[],
  lastAssistantResponse: string
): Promise<string | null> {
  try {
    // Combine recent user messages, taking up to 300 chars from each
    const userContext = recentUserMessages
      .map((msg) => msg.slice(0, 300))
      .join('\n\n');
    const assistantSnippet = lastAssistantResponse.slice(0, 500);

    const prompt = [
      'Based on these recent messages, what is the current focus of this conversation?',
      'Reply with ONLY a short task description (2-5 words).',
      'Start with a verb. Use plain text only - no markdown.',
      'Examples: "Fix authentication bug", "Add dark mode", "Refactor API layer", "Explain codebase structure"',
      '',
      'Recent user messages:',
      userContext,
      '',
      'Latest assistant response:',
      assistantSnippet,
      '',
      'Current focus:',
    ].join('\n');

    return await queryTitle(prompt);
  } catch (error) {
    console.error('[title-generator] Failed to regenerate title:', error);
    throw error;
  }
}
