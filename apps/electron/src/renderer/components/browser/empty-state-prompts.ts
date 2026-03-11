import type { BrowserEmptyPromptSample } from '@agent-operator/ui'

export const EMPTY_STATE_PROMPT_SAMPLES_ZH: readonly BrowserEmptyPromptSample[] = [
  {
    short: '调研当前页面并总结结论',
    full: '请使用当前浏览器调研这个页面，并总结核心信息、风险点和关键结论。',
  },
  {
    short: '检查表单流程并指出问题',
    full: '请使用当前浏览器检查这个页面的表单提交流程，并指出潜在问题和修复建议。',
  },
  {
    short: '做一轮页面 QA 检查',
    full: '请使用当前浏览器对这个页面做一轮 QA 检查，关注布局、文案、交互和异常状态。',
  },
  {
    short: '提取结构化信息',
    full: '请使用当前浏览器读取这个页面，并提取其中的结构化信息，按清晰字段输出。',
  },
] as const

export const EMPTY_STATE_PROMPT_SAMPLES_EN: readonly BrowserEmptyPromptSample[] = [
  {
    short: 'Research this page and summarize it',
    full: 'Use the current browser to research this page and summarize the key findings, risks, and takeaways.',
  },
  {
    short: 'Inspect the form flow',
    full: 'Use the current browser to inspect this form flow and point out likely issues and fixes.',
  },
  {
    short: 'Run a QA pass',
    full: 'Use the current browser to run a QA pass on this page and list layout, copy, interaction, and state issues.',
  },
  {
    short: 'Extract structured data',
    full: 'Use the current browser to read this page and extract the structured information it contains.',
  },
] as const
