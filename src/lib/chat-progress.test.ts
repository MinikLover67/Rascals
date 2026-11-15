import { describe, expect, it } from 'vitest'
import { lowestMissing, shouldReportProgress } from './chat'

describe('lowestMissing', () => {
  it('finds the first gap', () => {
    expect(lowestMissing(new Map([[0, 1], [1, 1], [3, 1]]), 4)).toBe(2)
  })

  it('returns 0 when empty, clamps when full', () => {
    expect(lowestMissing(new Map(), 10)).toBe(0)
    expect(lowestMissing(new Map([[0, 1], [1, 1]]), 2)).toBe(1)
  })
})

describe('shouldReportProgress', () => {
  it('always reports completion and resets', () => {
    expect(shouldReportProgress('f-done', 100, 100)).toBe(true)
  })

  it('throttles identical repeats', () => {
    const id = `f-throttle-${Date.now()}`
    expect(shouldReportProgress(id, 10, 100)).toBe(true)
    expect(shouldReportProgress(id, 10, 100)).toBe(false)
    expect(shouldReportProgress(id, 50, 100)).toBe(true)
  })
})
