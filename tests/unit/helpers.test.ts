import { describe, expect, it } from 'vitest'
import { formatPhone, isE164, maskPhone, normalizePhone, toWhatsAppDigits } from '@/lib/phone'
import { formatPktDate, formatPktDateTime, formatPktTime, pktDateKey } from '@/lib/dates-pkt'
import { formatAgo, formatDuration, formatRemaining } from '@/lib/duration'
import { formatPkr, formatPkrCompact } from '@/lib/money'
import { slaState } from '@/domain/sla'
import { formatLeadNo, formatQuotationNo } from '@/domain/numbering'

describe('phone', () => {
  it.each(['0300-1234567', '03001234567', '+92 300 1234567', '923001234567', '0092 300 1234567'])('normalises %s', (input) => {
    expect(normalizePhone(input)).toBe('+923001234567')
  })

  it.each(['', '   ', 'abc', '12345', null, undefined])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull()
  })

  it('keeps foreign numbers in E.164', () => {
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567')
  })

  it('formats, masks and builds WhatsApp digits', () => {
    expect(isE164('+923001234567')).toBe(true)
    expect(isE164('03001234567')).toBe(false)
    expect(formatPhone('+923001234567')).toBe('0300 1234567')
    expect(maskPhone('+923001234567')).toBe('0300 •••• 567')
    expect(toWhatsAppDigits('+923001234567')).toBe('923001234567')
  })
})

describe('dates-pkt', () => {
  const evening = new Date('2026-09-30T19:30:00Z') // 00:30 on 1 Oct in Pakistan

  it('buckets by the Pakistan calendar date', () => {
    expect(pktDateKey(evening)).toBe('2026-10-01')
    expect(pktDateKey(new Date('2026-09-30T05:32:00Z'))).toBe('2026-09-30')
  })

  it('formats PKT times and dates', () => {
    const morning = new Date('2026-09-30T05:32:00Z') // 10:32 PKT
    expect(formatPktTime(morning)).toBe('10:32 AM')
    expect(formatPktTime(evening)).toBe('12:30 AM')
    expect(formatPktDate(morning)).toBe('30 Sep 2026')
    expect(formatPktDateTime(morning)).toBe('30 Sep, 10:32 AM')
  })
})

describe('duration', () => {
  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(200_000)).toBe('3m 20s')
    expect(formatDuration(3_900_000)).toBe('1h 05m')
    expect(formatDuration(-200_000)).toBe('3m 20s')
    expect(formatDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h')
  })

  it('formats remaining and ago', () => {
    expect(formatRemaining(750_000)).toBe('Due in 12m 30s')
    expect(formatRemaining(-185_000)).toBe('Overdue 3m 05s')
    const now = new Date('2026-10-04T10:00:00Z')
    expect(formatAgo(new Date('2026-10-04T09:59:30Z'), now)).toBe('just now')
    expect(formatAgo(new Date('2026-10-04T09:55:00Z'), now)).toBe('5m ago')
  })
})

describe('money', () => {
  it('formats PKR like the PDF', () => {
    expect(formatPkr(6_500_000)).toBe('Rs. 6,500,000')
    expect(formatPkrCompact(6_500_000)).toBe('Rs. 65 lakh')
    expect(formatPkrCompact(15_000_000)).toBe('Rs. 1.5 crore')
    expect(formatPkrCompact(30_000)).toBe('Rs. 30,000')
  })
})

describe('sla', () => {
  const total = 15 * 60_000
  it('reports ok, due soon and breached', () => {
    expect(slaState(10 * 60_000, total)).toBe('ok')
    expect(slaState(4 * 60_000, total)).toBe('due_soon')
    expect(slaState(-1, total)).toBe('breached')
  })
})

describe('numbering', () => {
  it('formats lead and quotation numbers', () => {
    expect(formatLeadNo(42)).toBe('VL-00042')
    expect(formatQuotationNo(1025)).toBe('VO-1025')
  })
})
