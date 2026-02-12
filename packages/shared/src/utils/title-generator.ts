/**
 * Session title generator utility.
 * Uses Claude Agent SDK query() for all auth types (API Key, Claude OAuth).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getDefaultOptions } from '../agent/options.ts';
import { SUMMARIZATION_MODEL } from '../config/models.ts';

const FALLBACK_MIN_LENGTH = 8;
const FALLBACK_MAX_LENGTH = 20;
const FALLBACK_DEFAULT_TITLE = '处理当前任务内容';

/**
 * Build a prompt for generating a short task-focused title.
 */
export function buildTitlePrompt(message: string): string {
  const userSnippet = message.slice(0, 500);
  return [
    'What is the user trying to do? Reply with ONLY a short task description (2-5 words).',
    'Start with a verb. Use plain text only - no markdown.',
    'Examples: "Fix authentication bug", "Add dark mode", "Refactor API layer", "Explain codebase structure"',
    '',
    'User: ' + userSnippet,
    '',
    'Task:',
  ].join('\n');
}

/**
 * Build a prompt for regenerating a title from recent context.
 */
export function buildRegenerateTitlePrompt(
  recentUserMessages: string[],
  lastAssistantResponse: string
): string {
  const userContext = recentUserMessages
    .map((msg) => msg.slice(0, 300))
    .join('\n\n');
  const assistantSnippet = lastAssistantResponse.slice(0, 500);

  return [
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
}

/**
 * Validate and normalize a generated title.
 */
export function validateTitle(title: string | null | undefined): string | null {
  const normalized = normalizeTitle(title ?? '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeTitle(raw: string): string {
  // Keep first line and collapse whitespace so we don't reject otherwise good output.
  const singleLine = raw.split('\n')[0]?.trim() ?? '';
  const collapsed = singleLine.replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '');
  if (!collapsed) return '';
  return collapsed.length <= 100 ? collapsed : `${collapsed.slice(0, 97).trimEnd()}...`;
}

function trimToFallbackMaxLength(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= FALLBACK_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, FALLBACK_MAX_LENGTH - 1).trimEnd()}…`;
}

function isLikelyCJK(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function sanitizeFallbackCandidate(raw: string): string {
  const withoutCodeFence = raw.replace(/```[\s\S]*?```/g, ' ');
  const withoutInlineCode = withoutCodeFence.replace(/`([^`]+)`/g, '$1');
  const withoutMarkdownLinks = withoutInlineCode.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  const withoutUrls = withoutMarkdownLinks.replace(/https?:\/\/\S+/g, ' ');

  const collapsed = withoutUrls.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  const firstClause = collapsed.split(/[\n。！？!?]/).find((part) => part.trim().length > 0)?.trim() ?? collapsed;
  const strippedPrefix = firstClause
    .replace(/^[-*•>\d.)\s]+/, '')
    .replace(/^(请|请你|帮我|帮忙|麻烦|可以|能否|我想|我要|我需要)\s*/i, '')
    .replace(/^(please|can you|could you|would you|help me|i want to|i need to)\s+/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

  return strippedPrefix;
}

function padFallbackTitle(value: string): string {
  if (value.length >= FALLBACK_MIN_LENGTH) return value;
  const suffix = isLikelyCJK(value) ? '相关任务' : ' task';
  const padded = trimToFallbackMaxLength(`${value}${suffix}`.trim());
  if (padded.length >= FALLBACK_MIN_LENGTH) return padded;
  return FALLBACK_DEFAULT_TITLE;
}

export function buildFallbackTitleFromMessages(candidates: string[]): string {
  let shortCandidate = '';

  for (const rawCandidate of [...candidates].reverse()) {
    const sanitized = sanitizeFallbackCandidate(rawCandidate);
    if (!sanitized) continue;

    const clamped = trimToFallbackMaxLength(sanitized);
    if (clamped.length >= FALLBACK_MIN_LENGTH) return clamped;

    if (!shortCandidate) {
      shortCandidate = clamped;
    }
  }

  if (shortCandidate) {
    return padFallbackTitle(shortCandidate);
  }

  return FALLBACK_DEFAULT_TITLE;
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
    const prompt = buildTitlePrompt(userMessage);

    return await queryTitle(prompt);
  } catch (error) {
    console.error('[title-generator] Failed to generate title:', error);
    const fallbackTitle = buildFallbackTitleFromMessages([userMessage]);
    console.warn('[title-generator] Using fallback title:', fallbackTitle);
    return fallbackTitle;
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
    const prompt = buildRegenerateTitlePrompt(recentUserMessages, lastAssistantResponse);

    return await queryTitle(prompt);
  } catch (error) {
    console.error('[title-generator] Failed to regenerate title:', error);
    const fallbackCandidates = recentUserMessages.length > 0
      ? recentUserMessages
      : [lastAssistantResponse];
    const fallbackTitle = buildFallbackTitleFromMessages(fallbackCandidates);
    console.warn('[title-generator] Using fallback regenerated title:', fallbackTitle);
    return fallbackTitle;
  }
}
