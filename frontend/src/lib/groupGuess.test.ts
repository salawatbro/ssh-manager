import { describe, expect, it } from 'vitest'
import { guessGroups, isGitOnly, ownGroup, OTHER_GROUP, type GuessInput } from './groupGuess'

const h = (alias: string, host: string, user = 'deploy', proxyJump = ''): GuessInput => ({ alias, host, user, proxyJump })

describe('isGitOnly', () => {
  it('spots the git hosts and the git user', () => {
    expect(isGitOnly(h('github.com', 'github.com', 'git'))).toBe(true)
    expect(isGitOnly(h('gl', 'GitLab.com', 'me'))).toBe(true)
    expect(isGitOnly(h('forge', 'git.example.com', 'git'))).toBe(true)
    expect(isGitOnly(h('api', 'api.example.com'))).toBe(false)
  })
})

describe('ownGroup', () => {
  it('reads environment words from the alias, then the host', () => {
    expect(ownGroup(h('api-prod', '10.20.1.14'))).toBe('Production')
    expect(ownGroup(h('web', 'staging.example.com'))).toBe('Staging')
    expect(ownGroup(h('preprod-db', '10.0.0.4'))).toBe('Staging')
    expect(ownGroup(h('ci_dev', '10.0.0.5'))).toBe('Development')
    expect(ownGroup(h('nas', 'nas.local', 'admin'))).toBe('Home lab')
    expect(ownGroup(h('box', '192.168.1.40'))).toBe('Home lab')
  })

  it('does not match words inside other words', () => {
    expect(ownGroup(h('product-api', 'api.example.com'))).toBe('')
    expect(ownGroup(h('developer-portal', '10.0.0.9'))).toBe('')
  })

  it('lets the alias win over the host', () => {
    expect(ownGroup(h('api-prod', 'dev-box.example.com'))).toBe('Production')
  })
})

describe('guessGroups', () => {
  it('follows the jump host, and a jump host follows what it carries', () => {
    const g = guessGroups([
      h('bastion', 'bastion.example.com', 'ops'),
      h('worker-staging', '10.30.2.8', 'deploy', 'bastion'),
      h('db-primary', '10.20.1.30', 'postgres', 'bastion'),
      h('api-prod', '10.20.1.14'),
    ])
    expect(g.get('bastion')).toBe('Staging')
    expect(g.get('db-primary')).toBe('Staging')
    expect(g.get('api-prod')).toBe('Production')
  })

  it('puts the rest in Other once anything has a group', () => {
    const g = guessGroups([h('api-prod', '10.0.0.1'), h('old-vps', '198.51.100.23', 'root'), h('github.com', 'github.com', 'git')])
    expect(g.get('old-vps')).toBe(OTHER_GROUP)
    expect(g.get('github.com')).toBe(OTHER_GROUP)
  })

  it('leaves everything ungrouped when nothing hints at a group', () => {
    const g = guessGroups([h('alpha', 'alpha.example.com'), h('beta', 'beta.example.com')])
    expect([...g.values()]).toEqual(['', ''])
  })
})
