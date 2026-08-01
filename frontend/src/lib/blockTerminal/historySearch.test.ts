import { describe, expect, it } from 'vitest'
import { searchHistory } from './historySearch'

describe('searchHistory', () => {
  it('returns newest-first unique history for an empty query', () => {
    expect(searchHistory(['git status', 'ls', 'git status'], '')).toEqual(['git status', 'ls'])
  })

  it('finds fuzzy matches without changing the source', () => {
    const history = ['docker compose up', 'git status', 'kubectl get pods']
    expect(searchHistory(history, 'gstat')[0]).toBe('git status')
    expect(history).toEqual(['docker compose up', 'git status', 'kubectl get pods'])
  })

  it('returns no rows when nothing matches', () => {
    expect(searchHistory(['ls', 'pwd'], 'kubectl')).toEqual([])
  })
})
