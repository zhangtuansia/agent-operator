/**
 * PlanningAdvisor
 *
 * Provides heuristics for determining when tasks should use planning mode.
 * Used by both ClaudeAgent and CodexAgent to suggest planning for complex tasks.
 *
 * Planning is beneficial for:
 * - Multi-step implementations
 * - Large refactoring tasks
 * - Feature development
 * - Migration/upgrade tasks
 */

// ============================================================
// Types
// ============================================================

/**
 * Result of planning analysis.
 */
export interface PlanningAnalysis {
  /** Whether planning is recommended for this task */
  shouldPlan: boolean;

  /** Confidence level (0-1) of the recommendation */
  confidence: number;

  /** Reasons why planning was recommended (or not) */
  reasons: string[];
}

/**
 * Configuration for PlanningAdvisor.
 */
export interface PlanningAdvisorConfig {
  /**
   * Minimum message length to consider "long" (triggers planning check).
   * Default: 200 characters
   */
  longMessageThreshold?: number;

  /**
   * Minimum sentence count to consider "multi-step".
   * Default: 3 sentences
   */
  multiSentenceThreshold?: number;

  /**
   * Additional keywords to consider as complex task indicators.
   */
  additionalKeywords?: string[];

  /**
   * Keywords to exclude from complexity detection.
   */
  excludedKeywords?: string[];
}

// ============================================================
// Constants
// ============================================================

/**
 * Default keywords that suggest complex, multi-step tasks.
 */
const DEFAULT_COMPLEX_KEYWORDS = [
  // Creation/building
  'implement', 'create', 'build', 'develop', 'design',

  // Refactoring/restructuring
  'refactor', 'migrate', 'upgrade', 'restructure', 'reorganize',

  // Feature work
  'add feature', 'new feature', 'integrate', 'add support',

  // Setup/configuration
  'set up', 'setup', 'configure', 'install', 'initialize',

  // Scope indicators
  'multiple', 'several', 'all', 'entire', 'whole', 'across',

  // Architecture
  'architecture', 'system', 'framework', 'infrastructure',
];

/**
 * Keywords that suggest simple tasks (reduce planning confidence).
 */
const SIMPLE_TASK_KEYWORDS = [
  'fix', 'bug', 'typo', 'rename', 'update', 'change',
  'what', 'how', 'why', 'explain', 'show', 'list',
  'read', 'find', 'search', 'look', 'check',
];

// ============================================================
// PlanningAdvisor Class
// ============================================================

/**
 * Analyzes user messages to determine if planning mode should be suggested.
 *
 * Uses heuristics based on:
 * - Presence of complex task keywords
 * - Message length
 * - Number of sentences (multi-step indicator)
 * - Absence of simple task keywords
 */
export class PlanningAdvisor {
  private config: PlanningAdvisorConfig;
  private complexKeywords: string[];

  constructor(config: PlanningAdvisorConfig = {}) {
    this.config = config;

    // Build keyword list
    const excluded = new Set(config.excludedKeywords?.map(k => k.toLowerCase()) ?? []);
    this.complexKeywords = [
      ...DEFAULT_COMPLEX_KEYWORDS.filter(k => !excluded.has(k.toLowerCase())),
      ...(config.additionalKeywords ?? []),
    ].map(k => k.toLowerCase());
  }

  /**
   * Analyze a user message and determine if planning should be suggested.
   */
  analyze(userMessage: string): PlanningAnalysis {
    const message = userMessage.toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    // Check for complex keywords
    const foundKeywords = this.complexKeywords.filter(keyword => message.includes(keyword));
    if (foundKeywords.length > 0) {
      score += 0.4 + (foundKeywords.length - 1) * 0.1; // 0.4 for first, 0.1 for each additional
      reasons.push(`Contains complex task keywords: ${foundKeywords.slice(0, 3).join(', ')}`);
    }

    // Check message length
    const longThreshold = this.config.longMessageThreshold ?? 200;
    if (message.length > longThreshold) {
      score += 0.2;
      reasons.push(`Long message (${message.length} characters)`);
    }

    // Check for multiple sentences
    const sentenceThreshold = this.config.multiSentenceThreshold ?? 3;
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= sentenceThreshold) {
      score += 0.3;
      reasons.push(`Multiple sentences (${sentences.length})`);
    }

    // Check for simple task keywords (reduce score)
    const simpleKeywords = SIMPLE_TASK_KEYWORDS.filter(k => message.includes(k));
    if (simpleKeywords.length > 0 && foundKeywords.length === 0) {
      score -= 0.3;
      reasons.push(`Contains simple task keywords: ${simpleKeywords.slice(0, 2).join(', ')}`);
    }

    // Normalize score to 0-1
    const confidence = Math.max(0, Math.min(1, score));
    const shouldPlan = confidence >= 0.4;

    if (!shouldPlan && reasons.length === 0) {
      reasons.push('Task appears straightforward');
    }

    return {
      shouldPlan,
      confidence,
      reasons,
    };
  }

  /**
   * Quick check if planning should be suggested.
   * Simpler version of analyze() for cases where detailed reasons aren't needed.
   */
  shouldSuggestPlanning(userMessage: string): boolean {
    return this.analyze(userMessage).shouldPlan;
  }

  /**
   * Get the list of complex keywords being used.
   */
  getComplexKeywords(): string[] {
    return [...this.complexKeywords];
  }
}

/**
 * Create a PlanningAdvisor with default settings.
 */
export function createPlanningAdvisor(config?: PlanningAdvisorConfig): PlanningAdvisor {
  return new PlanningAdvisor(config);
}

/**
 * Simple function to check if planning should be suggested.
 * Uses a default PlanningAdvisor instance.
 */
const defaultAdvisor = new PlanningAdvisor();
export function shouldSuggestPlanning(userMessage: string): boolean {
  return defaultAdvisor.shouldSuggestPlanning(userMessage);
}
