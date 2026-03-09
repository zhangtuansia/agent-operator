/**
 * Skill Auto-Matching
 *
 * Matches user messages to skills via keyword triggers.
 * Runs before chat to auto-inject relevant skills without @mention.
 */

import type { LoadedSkill } from './types.ts';

/**
 * Built-in trigger keywords for bundled skills.
 * Used as fallback when a skill doesn't define `triggers` in its frontmatter.
 */
const BUILTIN_TRIGGERS: Record<string, string[]> = {
  'web-search': [
    'search', 'google', 'look up', 'find out', 'latest', 'current',
    'news', 'update', 'who is', 'when did', 'documentation', 'docs',
    '搜索', '搜一下', '查找', '查一下', '查查', '新闻', '最新', '热门',
    '文档', '资料', '当前',
  ],
  'playwright': [],
  'pdf': ['pdf', 'PDF'],
  'docx': ['docx', 'DOCX', 'word文档', 'Word文档'],
  'xlsx': [
    'xlsx', 'XLSX', 'excel', 'Excel', 'spreadsheet',
    '表格', '电子表格',
  ],
  'pptx': [
    'pptx', 'PPTX', 'ppt', 'PPT', 'slide', 'presentation',
    '幻灯片', '演示文稿',
  ],
  'canvas-design': [
    'poster', 'artwork', 'illustration',
    '海报', '设计图', '插画', '绘制海报',
  ],
  'frontend-design': [
    'landing page', 'web page', 'web component',
    '网页设计', '前端设计', '落地页',
  ],
  'weather': ['weather', '天气', '气温', '预报'],
  'scheduled-task': [
    'remind me', 'schedule', 'every day', 'every hour', 'every week', 'cron',
    '提醒我', '定时', '每天', '每小时', '每周', '定期', '定个',
  ],
  'local-tools': ['calendar', '日历', '日程'],
  'imap-smtp-email': [
    'email', 'inbox', 'send mail',
    '邮件', '收件箱', '发邮件', '写邮件',
  ],
  'remotion': ['remotion'],
  'develop-web-game': ['web game', '小游戏', '网页游戏'],
  'skill-creator': [],  // Only via @mention
  'create-plan': [],    // Model handles this natively
};

/** Max skills to auto-inject per message */
const MAX_AUTO_SKILLS = 2;
const AUTO_MATCH_DISABLED_SKILLS = new Set(['playwright', 'web-search']);

const BROWSER_INTERACTION_TRIGGERS = [
  'open url',
  'open website',
  'open browser',
  'open page',
  'visit',
  'navigate',
  'login',
  'log in',
  'sign in',
  'click',
  'fill',
  'submit',
  'upload',
  'scroll',
  'select',
  'drag',
  'screenshot',
  'browser_tool',
  '打开网页',
  '打开网站',
  '打开浏览器',
  '访问网站',
  '跳转到',
  '登录',
  '点击',
  '填写',
  '提交表单',
  '上传',
  '滚动',
  '选择',
  '拖拽',
  '截图',
  '浏览器操作',
];

function matchesTrigger(message: string, trigger: string): boolean {
  const triggerLower = trigger.toLowerCase();
  const isAscii = /^[a-z0-9 ]+$/i.test(trigger);
  if (isAscii) {
    const re = new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(message);
  }
  return message.includes(triggerLower);
}

function isBrowserInteractionMessage(messageLower: string): boolean {
  return BROWSER_INTERACTION_TRIGGERS.some((trigger) => matchesTrigger(messageLower, trigger));
}

/**
 * Get trigger keywords for a skill (frontmatter triggers > built-in fallback).
 */
function getTriggersForSkill(skill: LoadedSkill): string[] {
  if (skill.metadata.triggers && skill.metadata.triggers.length > 0) {
    return skill.metadata.triggers;
  }
  return BUILTIN_TRIGGERS[skill.slug] ?? [];
}

/**
 * Match user message against available skills using keyword triggers.
 * Returns matched skill slugs (max MAX_AUTO_SKILLS), sorted by relevance.
 *
 * @param message - The user's message text
 * @param skills - All loaded skills
 * @param excludeSlugs - Skills already @mentioned (skip these)
 */
export function matchSkillsToMessage(
  message: string,
  skills: LoadedSkill[],
  excludeSlugs?: string[],
): string[] {
  const excluded = new Set(excludeSlugs ?? []);
  const messageLower = message.toLowerCase();
  const browserInteraction = isBrowserInteractionMessage(messageLower);

  const matches: Array<{ slug: string; score: number }> = [];

  for (const skill of skills) {
    if (excluded.has(skill.slug)) continue;
    if (AUTO_MATCH_DISABLED_SKILLS.has(skill.slug)) continue;

    const triggers = getTriggersForSkill(skill);
    if (triggers.length === 0) continue;
    if (skill.slug === 'web-search' && browserInteraction) continue;

    let score = 0;
    for (const trigger of triggers) {
      const matched = matchesTrigger(messageLower, trigger);
      if (matched) {
        // Longer triggers = higher confidence (phrase match > single word)
        score += trigger.length;
      }
    }

    if (score > 0) {
      matches.push({ slug: skill.slug, score });
    }
  }

  // Sort by score descending, take top N
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_AUTO_SKILLS)
    .map((m) => m.slug);
}
