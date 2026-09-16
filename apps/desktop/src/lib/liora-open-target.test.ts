import { describe, expect, it } from 'vitest'

import {
  normalizeLioraOpenString,
  pathFromLioraDeepLink,
  pathFromOpenDeepLink,
  resolveLioraOpenPath
} from './liora-open-target'

describe('normalizeLioraOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeLioraOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeLioraOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped liora:// deep links to the same path', () => {
    expect(normalizeLioraOpenString('liora://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeLioraOpenString('liora://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps liora://open/… deep links by stripping the open host', () => {
    expect(normalizeLioraOpenString('liora://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeLioraOpenString('liora://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved liora kinds and unsafe paths', () => {
    expect(normalizeLioraOpenString('liora://blueprint/morning-brief')).toBeNull()
    expect(normalizeLioraOpenString('liora://plugin/install')).toBeNull()
    expect(normalizeLioraOpenString('https://example.com/x')).toBeNull()
    expect(normalizeLioraOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeLioraOpenString('index-network')).toBeNull()
  })
})

describe('resolveLioraOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveLioraOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveLioraOpenPath({ href: 'liora://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromLioraDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromLioraDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from liora://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromLioraDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromLioraDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromLioraDeepLink('plugin', 'install')).toBeNull()
  })
})
