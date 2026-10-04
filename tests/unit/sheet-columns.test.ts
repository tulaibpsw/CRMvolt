import { describe, expect, it } from 'vitest'
import { buildRowKey, detectColumns, mapSheetRow, normalizeHeader, routeDepartment } from '@/domain/sheet-columns'

const META_HEADERS = ['id', 'created_time', 'ad_name', 'campaign_name', 'form_name', 'platform', 'full_name', 'phone_number', 'city', 'what_is_your_monthly_electricity_bill?', 'roof_photo_link']

describe('detectColumns', () => {
  it('auto-detects Meta export headers, long form questions, and keeps unknown columns as dynamic', () => {
    const d = detectColumns(META_HEADERS)
    expect(d.mapping).toMatchObject({
      id: 'metaLeadId',
      created_time: 'submittedAt',
      full_name: 'name',
      phone_number: 'phone',
      campaign_name: 'campaignName',
      'what_is_your_monthly_electricity_bill?': 'monthlyBillPkr',
    })
    expect(d.dynamic).toEqual(['roof_photo_link'])
    expect(d.missingRequired).toEqual([])
  })

  it('handles hand-made Sheets with different spellings', () => {
    const d = detectColumns(['Customer Name', 'Mobile No.', 'City / Location', 'Called By', 'Follow up 1', 'Status'])
    expect(d.mapping).toMatchObject({ 'Customer Name': 'name', 'Mobile No.': 'phone', 'City / Location': 'city', 'Called By': 'agentName', Status: 'status' })
    expect(d.dynamic).toEqual(['Follow up 1'])
  })

  it('applies admin overrides and ignores, and reports a missing phone column', () => {
    const d = detectColumns(['Client', 'Contact Person', 'Junk'], { Client: 'name', Junk: 'ignore' })
    expect(d.mapping.Client).toBe('name')
    expect(d.ignored).toEqual(['Junk'])
    expect(d.missingRequired).toEqual(['phone'])
  })

  it('normalises headers', () => {
    expect(normalizeHeader('Phone-No.')).toBe('phoneno')
  })
})

describe('mapSheetRow', () => {
  it('maps fields, normalises Meta "p:" phones and keeps dynamic values', () => {
    const d = detectColumns(META_HEADERS)
    const row = mapSheetRow({ id: 'l:123', full_name: 'Ali Khan', phone_number: 'p:+923001234567', roof_photo_link: 'https://x', city: '' }, d)
    expect(row.phone).toBe('+923001234567')
    expect(row.fields.name).toBe('Ali Khan')
    expect(row.fields.city).toBeUndefined()
    expect(row.extra).toEqual({ roof_photo_link: 'https://x' })
  })
})

describe('routing and row keys', () => {
  const keywords = { TRADING: ['panel', 'inverter', 'wholesale'], INSTALLATION: ['install', 'home'] }
  it('routes by tab, department value or campaign keywords', () => {
    expect(routeDepartment({}, keywords, 'TRADING')).toBe('TRADING')
    expect(routeDepartment({ department: 'installation' }, keywords)).toBe('INSTALLATION')
    expect(routeDepartment({ campaignName: 'Panels Wholesale Oct' }, keywords)).toBe('TRADING')
    expect(routeDepartment({ campaignName: 'Brand awareness' }, keywords)).toBeNull()
  })

  it('builds stable keys from the Meta lead ID or a hash', () => {
    expect(buildRowKey({ tab: 'Leads', metaLeadId: 'l:123', phone: null })).toBe('meta:123')
    const a = buildRowKey({ tab: 'Leads', phone: '+923001234567', submittedAt: '2026-10-04' })
    expect(a).toBe(buildRowKey({ tab: 'Leads', phone: '+923001234567', submittedAt: '2026-10-04' }))
    expect(a).not.toBe(buildRowKey({ tab: 'Other', phone: '+923001234567', submittedAt: '2026-10-04' }))
  })
})
