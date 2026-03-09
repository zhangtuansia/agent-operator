import { describe, expect, it } from 'bun:test';
import { matchSkillsToMessage } from '../matching.ts';
import type { LoadedSkill } from '../types.ts';

function makeSkill(slug: string, description = slug): LoadedSkill {
  return {
    slug,
    metadata: {
      name: slug,
      description,
    },
    content: '',
    path: `/tmp/${slug}`,
    source: 'global',
  };
}

describe('matchSkillsToMessage', () => {
  const skills = [
    makeSkill('web-search', 'search the web'),
    makeSkill('playwright', 'external browser automation'),
  ];

  it('does not auto-match web-search for search-style requests anymore', () => {
    expect(matchSkillsToMessage('搜索一下今天的 AI 新闻', skills)).toEqual([]);
    expect(matchSkillsToMessage('look up the latest React docs', skills)).toEqual([]);
  });

  it('does not auto-match playwright for browser requests', () => {
    expect(matchSkillsToMessage('open twitter and login', skills)).toEqual([]);
    expect(matchSkillsToMessage('用浏览器打开网页然后截图', skills)).toEqual([]);
  });

  it('does not auto-match web-search for interactive browser requests', () => {
    expect(matchSkillsToMessage('打开推特并登录后点赞第一条推文', skills)).toEqual([]);
    expect(matchSkillsToMessage('open the site, fill the form, and upload the file', skills)).toEqual([]);
  });
});
