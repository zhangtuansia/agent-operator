export interface LlmValidationResult {
  success: boolean;
  error?: string;
}

export function parseValidationError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
    return 'Cannot connect to API server. Check the URL and network.';
  }
  if (lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'Authentication failed. Check your credentials.';
  }
  if (lower.includes('rate limit') || lower.includes('quota')) {
    return 'Rate limited or quota exceeded. Try again later.';
  }

  return message.slice(0, 200);
}
