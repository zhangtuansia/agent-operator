/**
 * Tests for PlanningAdvisor
 *
 * Tests the heuristics for determining when tasks should use planning mode.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  PlanningAdvisor,
  createPlanningAdvisor,
  shouldSuggestPlanning,
} from '../planning-advisor.ts';

describe('PlanningAdvisor', () => {
  let advisor: PlanningAdvisor;

  beforeEach(() => {
    advisor = new PlanningAdvisor();
  });

  describe('Complex Task Detection', () => {
    it('should suggest planning for implementation tasks', () => {
      expect(advisor.shouldSuggestPlanning('implement a user authentication system')).toBe(true);
      expect(advisor.shouldSuggestPlanning('create a new API endpoint for users')).toBe(true);
      expect(advisor.shouldSuggestPlanning('build a dashboard component')).toBe(true);
    });

    it('should suggest planning for refactoring tasks', () => {
      expect(advisor.shouldSuggestPlanning('refactor the authentication module')).toBe(true);
      expect(advisor.shouldSuggestPlanning('migrate from REST to GraphQL')).toBe(true);
      expect(advisor.shouldSuggestPlanning('restructure the project layout')).toBe(true);
    });

    it('should suggest planning for feature requests', () => {
      expect(advisor.shouldSuggestPlanning('add feature for dark mode')).toBe(true);
      expect(advisor.shouldSuggestPlanning('integrate with Stripe for payments')).toBe(true);
    });

    it('should suggest planning for setup tasks', () => {
      expect(advisor.shouldSuggestPlanning('set up the development environment')).toBe(true);
      expect(advisor.shouldSuggestPlanning('configure webpack for production')).toBe(true);
    });

    it('should suggest planning for scope-indicating words', () => {
      expect(advisor.shouldSuggestPlanning('update multiple files across the codebase')).toBe(true);
      expect(advisor.shouldSuggestPlanning('fix all type errors in the project')).toBe(true);
    });
  });

  describe('Simple Task Detection', () => {
    it('should not suggest planning for simple questions', () => {
      expect(advisor.shouldSuggestPlanning('what is this function doing?')).toBe(false);
      expect(advisor.shouldSuggestPlanning('how does the auth work?')).toBe(false);
      expect(advisor.shouldSuggestPlanning('explain the code')).toBe(false);
    });

    it('should not suggest planning for simple fixes', () => {
      // Single simple keywords don't trigger planning
      expect(advisor.shouldSuggestPlanning('fix typo')).toBe(false);
      expect(advisor.shouldSuggestPlanning('rename variable')).toBe(false);
    });

    it('should not suggest planning for file reads', () => {
      expect(advisor.shouldSuggestPlanning('read the config file')).toBe(false);
      expect(advisor.shouldSuggestPlanning('show me the code')).toBe(false);
    });
  });

  describe('Message Length Heuristic', () => {
    it('should suggest planning for long messages', () => {
      // Message over 200 chars triggers long message heuristic (0.2 score)
      // Combined with multiple sentences (0.3) should trigger planning
      const longMessage = 'Please help me with this task that requires analysis and consideration. ' +
        'There are many aspects to consider here and the work involves multiple components. ' +
        'We need to handle edge cases properly and ensure everything works correctly together. ' +
        'This is a substantial piece of work.';
      expect(longMessage.length).toBeGreaterThan(200);
      expect(advisor.shouldSuggestPlanning(longMessage)).toBe(true);
    });

    it('should not suggest planning for short messages without keywords', () => {
      expect(advisor.shouldSuggestPlanning('hello')).toBe(false);
      expect(advisor.shouldSuggestPlanning('thanks')).toBe(false);
    });
  });

  describe('Sentence Count Heuristic', () => {
    it('should suggest planning for multi-sentence messages', () => {
      const multiSentence = 'First do this task. Then do another thing. Finally complete it. Also check errors.';
      expect(advisor.shouldSuggestPlanning(multiSentence)).toBe(true);
    });
  });

  describe('Analysis Results', () => {
    it('should return detailed analysis with reasons', () => {
      const analysis = advisor.analyze('implement a new authentication system');
      expect(analysis.shouldPlan).toBe(true);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.reasons.length).toBeGreaterThan(0);
      expect(analysis.reasons.some(r => r.includes('keyword'))).toBe(true);
    });

    it('should return low confidence for simple tasks', () => {
      const analysis = advisor.analyze('fix typo');
      expect(analysis.shouldPlan).toBe(false);
      expect(analysis.confidence).toBeLessThan(0.4);
    });

    it('should accumulate confidence from multiple signals', () => {
      // Long message with keywords and multiple sentences
      const complexMessage = 'I need to implement a new authentication system. ' +
        'It should support OAuth and password login. ' +
        'Also add email verification. ' +
        'Make sure to integrate with our existing user service.';

      const analysis = advisor.analyze(complexMessage);
      expect(analysis.shouldPlan).toBe(true);
      expect(analysis.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Configuration', () => {
    it('should allow custom keywords', () => {
      const customAdvisor = new PlanningAdvisor({
        additionalKeywords: ['special-task'],
      });
      expect(customAdvisor.shouldSuggestPlanning('do the special-task')).toBe(true);
    });

    it('should allow excluding keywords', () => {
      const restrictedAdvisor = new PlanningAdvisor({
        excludedKeywords: ['implement'],
      });
      // 'implement' alone would normally trigger, but it's excluded
      const analysis = restrictedAdvisor.analyze('implement');
      expect(analysis.reasons.some(r => r.includes('implement'))).toBe(false);
    });

    it('should allow custom message length threshold', () => {
      const shortThresholdAdvisor = new PlanningAdvisor({
        longMessageThreshold: 50,
      });
      const analysis = shortThresholdAdvisor.analyze('a'.repeat(60));
      expect(analysis.reasons.some(r => r.includes('Long message'))).toBe(true);
    });

    it('should return configured keywords', () => {
      const customAdvisor = new PlanningAdvisor({
        additionalKeywords: ['custom-keyword'],
      });
      const keywords = customAdvisor.getComplexKeywords();
      expect(keywords).toContain('custom-keyword');
      expect(keywords).toContain('implement'); // Default keyword still present
    });
  });

  describe('Factory and Helper Functions', () => {
    it('should create advisor via factory', () => {
      const factoryAdvisor = createPlanningAdvisor({ longMessageThreshold: 100 });
      expect(factoryAdvisor).toBeInstanceOf(PlanningAdvisor);
    });

    it('should provide standalone shouldSuggestPlanning function', () => {
      expect(shouldSuggestPlanning('implement a new feature')).toBe(true);
      expect(shouldSuggestPlanning('hello')).toBe(false);
    });
  });
});
