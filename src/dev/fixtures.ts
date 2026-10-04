/** Demo view-model data for the /dev/ui catalog and component tests. Never imported by real pages. */
import type { AttemptView, FollowUpView, KpiItem, LeadDetail, LeadSummary, MessageView, TeamMemberView } from '@/domain/view-models'

const minutes = (now: Date, n: number) => new Date(now.getTime() + n * 60_000).toISOString()

export function makeFixtures(now: Date) {
  const ahmed = { id: 'u-ahmed', name: 'Ahmed Raza' }
  const hira = { id: 'u-hira', name: 'Hira Khan' }

  const leads: LeadSummary[] = [
    {
      id: 'l1', leadNo: 'VL-00041', name: 'Muhammad Bilal', phone: '+923001234567', department: 'INSTALLATION', stage: 'new', status: 'open',
      channel: 'sheet', sourceDetail: 'Solar Home Oct', agent: ahmed, assignmentState: 'assigned', attemptCount: 0,
      sla: { startedAt: minutes(now, -2), deadline: minutes(now, 3) }, receivedAt: minutes(now, -4),
    },
    {
      id: 'l2', leadNo: 'VL-00038', name: 'Ayesha Siddiqui', phone: '+923214567890', department: 'INSTALLATION', stage: 'interested', status: 'open',
      channel: 'whatsapp', sourceDetail: '10 kW system, zero bill', agent: ahmed, assignmentState: 'accepted', attemptCount: 2,
      nextFollowUpAt: minutes(now, 90), receivedAt: minutes(now, -60 * 26),
    },
    {
      id: 'l3', leadNo: 'VL-00035', name: 'Faisal Traders', phone: '+923335551212', maskPhone: true, department: 'TRADING', stage: 'quotation_sent', status: 'open',
      channel: 'meta_webhook', sourceDetail: 'Panels Wholesale', agent: hira, assignmentState: 'accepted', attemptCount: 3,
      nextFollowUpAt: minutes(now, -45), receivedAt: minutes(now, -60 * 72),
    },
    {
      id: 'l4', leadNo: 'VL-00042', name: 'Sana Iqbal', phone: '+923451112233', department: 'TRADING', stage: 'new', status: 'open',
      channel: 'website', assignmentState: 'waiting', attemptCount: 0, sla: { startedAt: minutes(now, -20), deadline: minutes(now, -5) },
      receivedAt: minutes(now, -20),
    },
  ]

  const lead: LeadDetail = {
    ...leads[1],
    altPhones: ['+923009998877'],
    city: 'Lahore',
    area: 'DHA Phase 6',
    campaignName: 'Solar Home Oct',
    adName: 'Zero bill video',
    ctwaHeadline: 'Get a 10 kW system with zero electricity bill',
  }

  const attempts: AttemptView[] = [
    {
      id: 'a1', channel: 'whatsapp_call', followUpNo: 1, agent: ahmed, tappedAt: minutes(now, -60 * 25), leftAt: minutes(now, -60 * 25 + 0.1),
      returnedAt: minutes(now, -60 * 25 + 4), loggedAt: minutes(now, -60 * 25 + 4.5), result: 'connected', response: 'interested',
      remarks: 'Bill is around Rs. 45,000. Wants site survey on Saturday.', proofStatus: 'verified', flags: [], reviewStatus: 'reviewed',
    },
    {
      id: 'a2', channel: 'phone_call', followUpNo: 2, agent: ahmed, tappedAt: minutes(now, -120), leftAt: minutes(now, -119.9),
      returnedAt: minutes(now, -119), loggedAt: minutes(now, -118.5), result: 'no_answer', screenshotUrl: '#screenshot',
      proofStatus: 'evidenced', flags: [], reviewStatus: 'pending',
    },
    {
      id: 'a3', channel: 'whatsapp_chat', followUpNo: 3, agent: hira, tappedAt: minutes(now, -30), loggedAt: minutes(now, -29.9),
      result: 'no_answer', proofStatus: 'flagged', flags: ['never_left_app', 'too_fast'], reviewStatus: 'pending',
    },
  ]

  const followUps: FollowUpView[] = [
    { id: 'f1', leadId: 'l2', leadName: 'Ayesha Siddiqui', number: 3, dueAt: minutes(now, 90), status: 'pending', isOverdue: false },
    { id: 'f2', leadId: 'l3', leadName: 'Faisal Traders', number: 2, dueAt: minutes(now, -45), status: 'pending', isOverdue: true },
    { id: 'f3', leadId: 'l1', leadName: 'Muhammad Bilal', number: 1, dueAt: minutes(now, -300), status: 'done', isOverdue: false },
  ]

  const team: TeamMemberView[] = [
    { id: 'u-ahmed', name: 'Ahmed Raza', role: 'agent', attendance: 'checked_in', since: minutes(now, -180), openLeads: 12, pendingAccept: 1, lastActionAt: minutes(now, -4) },
    { id: 'u-hamza', name: 'Hamza Ali', role: 'agent', attendance: 'on_break', since: minutes(now, -15), openLeads: 9, pendingAccept: 0, lastActionAt: minutes(now, -22) },
    { id: 'u-usman', name: 'Usman Tariq', role: 'agent', attendance: 'checked_out', openLeads: 7, pendingAccept: 0 },
  ]

  const messages: MessageView[] = [
    { id: 'm1', direction: 'in', sentFrom: 'customer', text: 'Assalam o Alaikum, I saw your ad. What is the price for 10 kW?', at: minutes(now, -60 * 26), status: 'received' },
    { id: 'm2', direction: 'out', sentFrom: 'app', senderName: 'Ahmed Raza', text: 'Walaikum Assalam! I am Ahmed from Volt On Solar. Can I call you now?', at: minutes(now, -60 * 25.5), status: 'read' },
    { id: 'm3', direction: 'out', sentFrom: 'api', senderName: 'Ahmed Raza', text: 'Sharing the survey slot for Saturday 11 AM.', at: minutes(now, -60), status: 'delivered' },
  ]

  const kpis: KpiItem[] = [
    { key: 'totalLeads', value: 125 },
    { key: 'newUnassigned', value: '9 / 2' },
    { key: 'assignedSigned', value: '116 / 110' },
    { key: 'calledNotCalled', value: '92 / 18' },
    { key: 'interestedFollowUp', value: '45 / 27' },
    { key: 'quotationSent', value: 31 },
    { key: 'inProcess', value: 14 },
    { key: 'wonSales', value: 8 },
    { key: 'lost', value: 9 },
    { key: 'salesValue', value: 'Rs. 65 lakh', hint: 'Rs. 6,500,000' },
    { key: 'commission', value: 0, comingIn: 4 },
  ]

  return { leads, lead, attempts, followUps, team, messages, kpis }
}
