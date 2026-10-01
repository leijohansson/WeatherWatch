import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash } from './useRoute'

describe('hash routes', () => {
  it('parses Watch and Live routes', () => {
    expect(parseRoute('')).toEqual({ mode: 'watch', focus: null, fromAlert: false })
    expect(parseRoute('#/')).toMatchObject({ mode: 'watch' })
    expect(parseRoute('#/watch')).toMatchObject({ mode: 'watch' })
    expect(parseRoute('#/live')).toMatchObject({ mode: 'live' })
    expect(parseRoute('#/live?focus=home&from=alert')).toEqual({
      mode: 'live',
      focus: 'home',
      fromAlert: true,
    })
    expect(parseRoute('#/nowhere')).toMatchObject({ mode: 'watch' })
  })

  it('builds hashes', () => {
    expect(routeHash('live', { focus: 'a b' })).toBe('#/live?focus=a+b')
    expect(routeHash('watch')).toBe('#/watch')
  })
})
