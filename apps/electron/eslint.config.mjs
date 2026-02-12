/**
 * ESLint Configuration for Electron App
 *
 * Uses flat config format (ESLint 9+).
 * Includes custom rules to enforce cross-platform and architecture invariants.
 */

import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import noDirectNavigationState from './eslint-rules/no-direct-navigation-state.cjs'
import noLocalStorage from './eslint-rules/no-localstorage.cjs'
import noDirectPlatformCheck from './eslint-rules/no-direct-platform-check.cjs'
import noHardcodedPathSeparator from './eslint-rules/no-hardcoded-path-separator.cjs'
import noDirectFileOpen from './eslint-rules/no-direct-file-open.cjs'
import noInlineSourceAuthCheck from './eslint-rules/no-inline-source-auth-check.cjs'

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'release/**',
      '*.cjs',
      'eslint-rules/**',
    ],
  },

  // TypeScript/React files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'cowork-agent': {
        rules: {
          'no-direct-navigation-state': noDirectNavigationState,
          'no-localstorage': noLocalStorage,
        },
      },
      'cowork-platform': {
        rules: {
          'no-direct-platform-check': noDirectPlatformCheck,
        },
      },
      'cowork-paths': {
        rules: {
          'no-hardcoded-path-separator': noHardcodedPathSeparator,
        },
      },
      'cowork-links': {
        rules: {
          'no-direct-file-open': noDirectFileOpen,
        },
      },
      'cowork-sources': {
        rules: {
          'no-inline-source-auth-check': noInlineSourceAuthCheck,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Custom Cowork rules
      'cowork-agent/no-direct-navigation-state': 'error',
      'cowork-agent/no-localstorage': 'warn',
      'cowork-platform/no-direct-platform-check': 'warn',
      'cowork-paths/no-hardcoded-path-separator': 'warn',
      'cowork-links/no-direct-file-open': 'warn',
      'cowork-sources/no-inline-source-auth-check': 'warn',

      // Enforce centralized action registry for keyboard shortcuts
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'react-hotkeys-hook',
            message: 'Use useAction from @/actions instead. See actions/index.ts',
          },
        ],
      }],
    },
  },
]
