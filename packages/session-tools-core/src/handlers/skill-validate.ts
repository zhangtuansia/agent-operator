/**
 * Skill Validate Handler
 *
 * Validates a skill's SKILL.md file for correct format and required fields.
 */

import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { errorResponse } from '../response.ts';
import {
  validateSlug,
  validateSkillContent,
  formatValidationResult,
} from '../validation.ts';
import { getSkillMdPath, skillMdExists } from '../source-helpers.ts';

export interface SkillValidateArgs {
  skillSlug: string;
}

/**
 * Handle the skill_validate tool call.
 *
 * 1. Validate slug format
 * 2. Check SKILL.md exists
 * 3. Read and validate content (frontmatter + body)
 * 4. Return validation result
 */
export async function handleSkillValidate(
  ctx: SessionToolContext,
  args: SkillValidateArgs
): Promise<ToolResult> {
  const { skillSlug } = args;

  // Validate slug format first
  const slugResult = validateSlug(skillSlug);
  if (!slugResult.valid) {
    return {
      content: [{ type: 'text', text: formatValidationResult(slugResult) }],
      isError: true,
    };
  }

  // Check SKILL.md exists
  const skillMdPath = getSkillMdPath(ctx.workspacePath, skillSlug);
  if (!skillMdExists(ctx.workspacePath, skillSlug)) {
    return errorResponse(
      `SKILL.md not found at ${skillMdPath}. Create it with YAML frontmatter.`
    );
  }

  // Read and validate content
  let content: string;
  try {
    content = ctx.fs.readFile(skillMdPath);
  } catch (e) {
    return errorResponse(
      `Cannot read file: ${e instanceof Error ? e.message : 'Unknown error'}`
    );
  }

  const result = validateSkillContent(content, skillSlug);
  return {
    content: [{ type: 'text', text: formatValidationResult(result) }],
    isError: !result.valid,
  };
}
