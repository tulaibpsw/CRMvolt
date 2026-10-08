import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { requireUser } from '@/server/auth/session'

export const metadata = { title: 'Help' }

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">{i + 1}</span>
          <span className="pt-1">{item}</span>
        </li>
      ))}
    </ol>
  )
}

/** Plain-language guide: the steps of a lead and what each person does. */
export default async function HelpPage() {
  const user = await requireUser()
  const manager = user.role !== 'agent' && user.role !== 'field_agent'
  return (
    <>
      <PageHeader title="Help — how the CRM works" description="The steps of every lead, and what to do at each step." />

      <SectionCard title="The life of a lead">
        <Steps
          items={[
            <>A lead arrives from the <b>Google Sheet</b>, <b>WhatsApp</b> or is added by hand. It goes to the next <b>checked-in</b> agent in the team order (or the manager assigns it).</>,
            <>The agent gets an alert and taps <b>Accept</b> (within the time set by the manager). Only then the customer&apos;s number appears.</>,
            <><b>Try 1</b> — tap <b>WhatsApp</b>, <b>WA call</b> or <b>Call</b>. When you come back to the app, it asks <b>“What happened?”</b>. Save it every time — it is your proof.</>,
            <>No answer? <b>Try 2</b> is planned for the next day and <b>Try 3</b> three days later. You get reminders (in office hours).</>,
            <>Close the lead: <b>Deal done</b> (with the sale value), <b>Not interested</b>, or after 3 no-answers on different days it becomes <b>Dead</b>.</>,
            <>The manager checks every close in <b>Proof review</b>. <b>OK</b> keeps it (a sale then counts), <b>Dispute</b> re-opens the lead for another agent.</>,
          ]}
        />
      </SectionCard>

      <SectionCard title="For call agents — your day">
        <Steps
          items={[
            <>Start of day: Dashboard → <b>Check in</b>. Leads only come to checked-in agents. Use <b>Start break</b> for breaks and <b>Check out</b> when you leave.</>,
            <>New lead alert → open it → <b>Accept</b>.</>,
            <>On the lead page, the coloured box at the top tells you <b>what to do now</b>, and the steps show where the lead is.</>,
            <>Tap WhatsApp / Call → talk → come back → choose the result: <b>Connected</b>, <b>No answer</b>, <b>Busy</b>, <b>Number off</b>, <b>Wrong number</b> or <b>Couldn&apos;t call now</b>. If connected, choose what the customer said.</>,
            <>Tapped by mistake? In the same window press <b>“I tapped by mistake”</b> — it does not count as a try.</>,
            <>Add a screenshot of the call log or chat when you can — it is the best proof.</>,
            <>Follow-ups for today are on <b>Follow-ups</b> and on your dashboard.</>,
          ]}
        />
      </SectionCard>

      <SectionCard title="For field agents — site visits">
        <Steps
          items={[
            <>Check in when you start field work — new visits go to checked-in field agents first (the one with the least kW gets the next visit).</>,
            <>Open <b>Site visits</b>: call the customer, open the map, go.</>,
            <>After the visit choose <b>Visited</b>, <b>Interested</b>, <b>Not interested</b> or <b>Rescheduled</b> and write what happened. “Not interested” gives the visit to another field agent.</>,
          ]}
        />
      </SectionCard>

      {manager ? (
        <SectionCard title="For managers">
          <Steps
            items={[
              <>Settings → <b>Users</b>: add your call agents and field agents (they choose their own password at first sign-in).</>,
              <>Settings → <b>Google Sheets</b>: connect your leads Sheet, then press <b>Start from now</b> (or import history) once. Do not rename the phone / date columns.</>,
              <>Team page: the <b>assignment order</b>, timings, “only checked-in agents”, “give out leads at night too”, pause.</>,
              <>Dashboard → <b>Waiting for assignment</b> shows why leads wait (nobody checked in, office closed…) and has <b>Assign waiting leads now</b>.</>,
              <>Lead page → <b>Manage</b>: assign by hand, move to another department, <b>Ping</b> the agent.</>,
              <>Settings → <b>My alerts</b>: choose which employee actions you hear about (accept, WhatsApp/Call taps, results, check-in…), for everyone or selected people.</>,
              <><b>Proof review</b>: approve or dispute closes, flagged calls and spot checks (call the customer to confirm).</>,
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Buttons you will see everywhere">
        <ul className="list-disc space-y-1 ps-5 text-sm">
          <li>
            <b>↻ Refresh</b> (top bar) — loads the newest data on any page.
          </li>
          <li>
            <b>🔔 Bell</b> — your alerts (new leads, follow-ups due, pings from your manager).
          </li>
          <li>
            <b>Sheet details</b> on a lead — every column the Google Sheet sent for that customer.
          </li>
        </ul>
      </SectionCard>
    </>
  )
}
