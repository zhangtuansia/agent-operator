/**
 * Shared types for the server-owned OAuth prepare/exchange flow.
 */

export type OAuthProvider = 'mcp' | 'google' | 'slack' | 'microsoft'

export interface PreparedOAuthFlow {
  authUrl: string
  state: string
  codeVerifier: string
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  provider: OAuthProvider
}

export interface OAuthExchangeParams {
  code: string
  codeVerifier: string
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  redirectUri: string
}

export interface OAuthExchangeResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  email?: string
  oauthClientId?: string
  oauthClientSecret?: string
  error?: string
}
