export type CliDomainNamespace = 'label' | 'source' | 'skill' | 'automation' | 'permission' | 'theme'

export interface CliDomainPolicy {
  namespace: CliDomainNamespace
  helpCommand: string
  workspacePathScopes: string[]
  readActions: string[]
  quickExamples: string[]
  bashGuardPaths?: string[]
}

const CLI_COMMANDS = ['dazi-cli', 'cowork-cli'] as const
const CLI_ALTERNATION = `(?:${CLI_COMMANDS.join('|')})`

const POLICIES: Record<CliDomainNamespace, CliDomainPolicy> = {
  label: {
    namespace: 'label',
    helpCommand: 'dazi-cli label --help',
    workspacePathScopes: ['labels/**'],
    readActions: ['list', 'get', 'auto-rule-list', 'auto-rule-validate'],
    quickExamples: [
      'dazi-cli label list',
      'dazi-cli label create --name "Bug" --color "accent"',
      'dazi-cli label update bug --json \'{"name":"Bug Report"}\'',
    ],
    bashGuardPaths: ['labels/**'],
  },
  source: {
    namespace: 'source',
    helpCommand: 'dazi-cli source --help',
    workspacePathScopes: ['sources/**'],
    readActions: ['list', 'get', 'validate', 'test', 'auth-help'],
    quickExamples: [
      'dazi-cli source list',
      'dazi-cli source get <slug>',
      'dazi-cli source update <slug> --json "{...}"',
      'dazi-cli source validate <slug>',
    ],
  },
  skill: {
    namespace: 'skill',
    helpCommand: 'dazi-cli skill --help',
    workspacePathScopes: ['skills/**'],
    readActions: ['list', 'get', 'validate', 'where'],
    quickExamples: [
      'dazi-cli skill list',
      'dazi-cli skill get <slug>',
      'dazi-cli skill update <slug> --json "{...}"',
      'dazi-cli skill validate <slug>',
    ],
  },
  automation: {
    namespace: 'automation',
    helpCommand: 'dazi-cli automation --help',
    workspacePathScopes: ['automations.json', 'automations-history.jsonl'],
    readActions: ['list', 'get', 'validate', 'history', 'last-executed', 'test', 'lint'],
    quickExamples: [
      'dazi-cli automation list',
      'dazi-cli automation create --event UserPromptSubmit --prompt "Summarize this prompt"',
      'dazi-cli automation update <id> --json "{\"enabled\":false}"',
      'dazi-cli automation history <id> --limit 20',
      'dazi-cli automation validate',
    ],
    bashGuardPaths: ['automations.json', 'automations-history.jsonl'],
  },
  permission: {
    namespace: 'permission',
    helpCommand: 'dazi-cli permission --help',
    workspacePathScopes: ['permissions.json', 'sources/*/permissions.json'],
    readActions: ['list', 'get', 'validate'],
    quickExamples: [
      'dazi-cli permission list',
      'dazi-cli permission get --source linear',
      'dazi-cli permission add-mcp-pattern "list" --comment "All list ops" --source linear',
      'dazi-cli permission validate',
    ],
    bashGuardPaths: ['permissions.json', 'sources/*/permissions.json'],
  },
  theme: {
    namespace: 'theme',
    helpCommand: 'dazi-cli theme --help',
    workspacePathScopes: ['config.json', 'theme.json', 'themes/*.json'],
    readActions: ['get', 'validate', 'list-presets', 'get-preset'],
    quickExamples: [
      'dazi-cli theme get',
      'dazi-cli theme list-presets',
      'dazi-cli theme set-color-theme nord',
      'dazi-cli theme set-workspace-color-theme default',
      'dazi-cli theme set-override --json "{\"accent\":\"#3b82f6\"}"',
    ],
    bashGuardPaths: ['config.json', 'theme.json', 'themes/*.json'],
  },
}

export const CLI_DOMAIN_POLICIES = POLICIES

export interface CliDomainScopeEntry {
  namespace: CliDomainNamespace
  scope: string
}

function dedupeScopes(scopes: string[]): string[] {
  return [...new Set(scopes)]
}

export const DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES = dedupeScopes(
  Object.values(POLICIES).flatMap(policy => policy.workspacePathScopes),
)

export const DAZI_CLI_OWNED_BASH_GUARD_PATH_SCOPES = dedupeScopes(
  Object.values(POLICIES).flatMap(policy => policy.bashGuardPaths ?? []),
)

export const DAZI_CLI_WORKSPACE_SCOPE_ENTRIES: CliDomainScopeEntry[] = Object.values(POLICIES)
  .flatMap(policy => policy.workspacePathScopes.map(scope => ({ namespace: policy.namespace, scope })))

export const DAZI_CLI_BASH_GUARD_SCOPE_ENTRIES: CliDomainScopeEntry[] = Object.values(POLICIES)
  .flatMap(policy => (policy.bashGuardPaths ?? []).map(scope => ({ namespace: policy.namespace, scope })))

export interface BashPatternRule {
  pattern: string
  comment: string
}

export function getDaziCliReadOnlyBashPatterns(): BashPatternRule[] {
  const namespaces = Object.keys(POLICIES) as CliDomainNamespace[]
  const namespaceAlternation = namespaces.join('|')

  const rules: BashPatternRule[] = namespaces.map((namespace) => {
    const policy = POLICIES[namespace]
    const actions = policy.readActions.join('|')
    return {
      pattern: `^${CLI_ALTERNATION}\\s+${namespace}\\s+(${actions})\\b`,
      comment: `${namespace} read-only CLI operations`,
    }
  })

  rules.push(
    { pattern: `^${CLI_ALTERNATION}\\s*$`, comment: 'CLI bare invocation (prints help)' },
    { pattern: `^${CLI_ALTERNATION}\\s+(${namespaceAlternation})\\s*$`, comment: 'CLI entity help' },
    { pattern: `^${CLI_ALTERNATION}\\s+(${namespaceAlternation})\\s+--help\\b`, comment: 'CLI entity help flags' },
    { pattern: `^${CLI_ALTERNATION}\\s+--(help|version)\\b`, comment: 'CLI global flags' },
  )

  return rules
}

export function getCliDomainPolicy(namespace: CliDomainNamespace): CliDomainPolicy {
  return POLICIES[namespace]
}
