import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildRedirect, grantScope, isAllowedRedirectUri, isCimdClientId, isOwnResource, parseCimdDocument, redirectUriMatches, verifyPkceS256 } from '../server/oauth/core'

describe('PKCE S256', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' // RFC 7636 Appendix B
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  it('accepts the RFC 7636 example', () => {
    expect(verifyPkceS256(verifier, challenge)).toBe(true)
  })
  it('rejects a wrong verifier, plain challenges and too short verifiers', () => {
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false)
    expect(verifyPkceS256(verifier, verifier)).toBe(false)
    const short = 'abc'
    expect(verifyPkceS256(short, createHash('sha256').update(short).digest('base64url'))).toBe(false)
  })
})

describe('redirect URIs', () => {
  it.each(['https://claude.ai/api/mcp/auth_callback', 'http://localhost:33418/callback', 'http://127.0.0.1/cb', 'http://[::1]:8080/cb'])('allows %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true)
  })
  it.each(['http://example.org/cb', 'https://example.org/cb#frag', 'javascript:alert(1)', 'cursor://callback', 'not a url'])('rejects %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false)
  })
  it('matches exactly, but allows any port for loopback redirects', () => {
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb')).toBe(true)
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb2')).toBe(false)
    expect(redirectUriMatches(['http://127.0.0.1:1234/callback'], 'http://127.0.0.1:5555/callback')).toBe(true)
    expect(redirectUriMatches(['http://127.0.0.1:1234/callback'], 'http://127.0.0.1:5555/other')).toBe(false)
    expect(redirectUriMatches(['http://localhost:1234/callback'], 'http://127.0.0.1:1234/callback')).toBe(false)
    expect(redirectUriMatches(['https://claude.ai:443/cb'], 'https://claude.ai:8443/cb')).toBe(false)
  })

  it('appends parameters and keeps existing ones', () => {
    expect(buildRedirect('https://a.example/cb?x=1', { code: 'c', state: undefined, iss: 'https://q.example' }))
      .toBe('https://a.example/cb?x=1&code=c&iss=https%3A%2F%2Fq.example')
  })
})

describe('client ID metadata documents', () => {
  const url = 'https://app.example.com/oauth/client.json'

  it('detects URL-formatted client ids', () => {
    expect(isCimdClientId(url)).toBe(true)
    expect(isCimdClientId('https://app.example.com/')).toBe(false)
    expect(isCimdClientId('http://app.example.com/client.json')).toBe(false)
    expect(isCimdClientId('a1b2c3')).toBe(false)
  })

  it('validates the document', () => {
    const doc = { client_id: url, client_name: 'Example', redirect_uris: ['http://localhost:3000/callback'] }
    expect(parseCimdDocument(url, doc)).toEqual({ id: url, name: 'Example', redirectUris: ['http://localhost:3000/callback'] })
    expect(parseCimdDocument(url, { ...doc, client_id: 'https://evil.example/client.json' })).toBeNull()
    expect(parseCimdDocument(url, { ...doc, redirect_uris: ['http://evil.example/cb'] })).toBeNull()
    expect(parseCimdDocument(url, { ...doc, client_name: '' })).toBeNull()
    expect(parseCimdDocument(url, 'nope')).toBeNull()
  })
})

describe('scope & resource', () => {
  it('grants the mcp scope, tolerates offline_access, rejects others', () => {
    expect(grantScope(undefined)).toBe('mcp')
    expect(grantScope('mcp offline_access')).toBe('mcp')
    expect(grantScope('admin')).toBeNull()
  })

  it('accepts only this server as resource', () => {
    const origin = 'https://exam.example.org'
    expect(isOwnResource('https://exam.example.org/mcp', origin)).toBe(true)
    expect(isOwnResource('https://EXAM.example.org/mcp/', origin)).toBe(true)
    expect(isOwnResource('https://exam.example.org', origin)).toBe(true)
    expect(isOwnResource('https://other.example.org/mcp', origin)).toBe(false)
    expect(isOwnResource('https://exam.example.org/api', origin)).toBe(false)
    expect(isOwnResource('https://exam.example.org/mcp#x', origin)).toBe(false)
  })
})
