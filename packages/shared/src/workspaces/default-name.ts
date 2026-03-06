const DEFAULT_WORKSPACE_NAMES = {
  zh: '我的工作区',
  en: 'My Workspace',
} as const;

type SupportedWorkspaceLanguage = keyof typeof DEFAULT_WORKSPACE_NAMES;

function normalizeWorkspaceLanguage(language?: string): SupportedWorkspaceLanguage {
  const candidate = (language ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? '')
    .toLowerCase();

  return candidate.startsWith('zh') ? 'zh' : 'en';
}

export function getDefaultWorkspaceName(language?: string): string {
  return DEFAULT_WORKSPACE_NAMES[normalizeWorkspaceLanguage(language)];
}
