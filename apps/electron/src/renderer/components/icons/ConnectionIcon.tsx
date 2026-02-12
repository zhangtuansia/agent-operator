import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProviderLogo } from './ProviderLogo'
import { getModelDisplayName } from '@config/models'
import { cn } from '@/lib/utils'
import type { LlmConnectionWithStatus } from '../../../shared/types'

interface ConnectionIconProps {
  connection: Pick<LlmConnectionWithStatus, 'name' | 'providerType' | 'baseUrl' | 'defaultModel'> & { type?: string }
  size?: number
  className?: string
  showTooltip?: boolean
}

function inferProviderId(connection: ConnectionIconProps['connection']): string {
  const baseUrl = connection.baseUrl?.toLowerCase() ?? ''
  if (baseUrl.includes('deepseek')) return 'deepseek'
  if (baseUrl.includes('minimax')) return 'minimax'
  if (baseUrl.includes('bigmodel') || baseUrl.includes('glm')) return 'glm'
  if (baseUrl.includes('moonshot') || baseUrl.includes('kimi')) return 'kimi'
  if (baseUrl.includes('doubao') || baseUrl.includes('volcengine')) return 'doubao'
  if (baseUrl.includes('gemini') || baseUrl.includes('googleapis')) return 'gemini'
  if (baseUrl.includes('openai')) return 'openai'
  if (baseUrl.includes('anthropic')) return 'anthropic'

  const providerType = (connection.providerType || connection.type || '').toLowerCase()
  if (providerType.includes('anthropic') || providerType === 'bedrock') return 'anthropic'
  if (providerType.includes('openai') || providerType === 'copilot') return 'openai'

  const name = connection.name.toLowerCase()
  if (name.includes('deepseek')) return 'deepseek'
  if (name.includes('minimax')) return 'minimax'
  if (name.includes('glm')) return 'glm'
  if (name.includes('kimi')) return 'kimi'
  if (name.includes('doubao')) return 'doubao'
  if (name.includes('gemini')) return 'gemini'

  return providerType || 'custom'
}

export function ConnectionIcon({ connection, size = 16, className, showTooltip = false }: ConnectionIconProps) {
  const icon = (
    <ProviderLogo
      provider={inferProviderId(connection)}
      size={size}
      className={cn('rounded-[3px] shrink-0', className)}
    />
  )

  if (!showTooltip) return icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{icon}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <div className="text-center">
          <div>{connection.name}</div>
          {connection.defaultModel && (
            <div className="text-[10px] opacity-60">{getModelDisplayName(connection.defaultModel)}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
