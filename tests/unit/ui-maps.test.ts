import { describe, expect, it } from 'vitest'
import * as C from '@/domain/constants'
import { ENUM_UI_MAPS, INTERNAL_ENUMS, LABEL_ONLY_ENUMS, optionsFor } from '@/domain/ui-maps'
import { isActivePath, mobileNavItemsFor, navItemsFor } from '@/domain/navigation'

const sorted = (values: readonly string[]) => [...values].sort()

describe('every enum is classified', () => {
  it('each UPPER_SNAKE array in constants.ts is a UI map, label-only, or internal', () => {
    const classified = new Set<string>([...Object.keys(ENUM_UI_MAPS), ...Object.keys(LABEL_ONLY_ENUMS), ...INTERNAL_ENUMS])
    const arrays = Object.entries(C)
      .filter(([name, value]) => Array.isArray(value) && name === name.toUpperCase())
      .map(([name]) => name)
    expect(arrays.filter((name) => !classified.has(name))).toEqual([])
  })
})

describe('enum ↔ UI map coverage', () => {
  for (const [name, [values, map]] of Object.entries(ENUM_UI_MAPS)) {
    it(`${name}: every value has a label and a valid tone, and there are no extra keys`, () => {
      expect(sorted(Object.keys(map))).toEqual(sorted(values))
      for (const meta of Object.values(map)) {
        expect(meta.label.trim()).not.toBe('')
        expect(C.TONES).toContain(meta.tone)
      }
    })
  }

  for (const [name, [values, labels]] of Object.entries(LABEL_ONLY_ENUMS)) {
    it(`${name}: every value has a label`, () => {
      expect(sorted(Object.keys(labels))).toEqual(sorted(values))
      for (const label of Object.values(labels)) expect(String(label).trim()).not.toBe('')
    })
  }
})

describe('pipelines', () => {
  it('trading skips the site survey and both end with won, lost', () => {
    expect(C.PIPELINES.TRADING).not.toContain('site_survey')
    expect(C.PIPELINES.INSTALLATION).toContain('site_survey')
    for (const department of C.DEPARTMENTS) expect(C.PIPELINES[department].slice(-2)).toEqual(['won', 'lost'])
  })
})

describe('optionsFor', () => {
  it('keeps definition order', () => {
    expect(optionsFor(C.SHADING_LEVELS, LABEL_ONLY_ENUMS.SHADING_LEVELS[1]).map((o) => o.value)).toEqual(['none', 'partial', 'heavy'])
  })
})

describe('navigation', () => {
  it('agents never see admin-only items and get at most 4 bottom-bar items', () => {
    expect(navItemsFor('agent').map((i) => i.href)).not.toContain('/settings')
    expect(mobileNavItemsFor('manager').length).toBeLessThanOrEqual(4)
  })

  it('matches nested paths as active', () => {
    expect(isActivePath('/leads/123', '/leads')).toBe(true)
    expect(isActivePath('/leadsx', '/leads')).toBe(false)
  })
})
