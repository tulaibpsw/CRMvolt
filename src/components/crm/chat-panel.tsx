import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { EmptyState } from '@/components/common/states'
import { MessageBubble } from '@/components/crm/message-bubble'
import type { MessageView } from '@/domain/view-models'
import { sendWhatsAppAction } from '@/server/actions'

/** WhatsApp conversation for a lead: mirrored messages (customer, phone-app echoes, CRM sends) + a reply box. */
export function ChatPanel({ leadId, messages }: { leadId: string; messages: MessageView[] }) {
  return (
    <div className="space-y-3">
      <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3">
        {messages.length === 0 ? <EmptyState title="No WhatsApp messages yet" description="Messages appear here once WhatsApp is connected." /> : messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      </div>
      <ActionForm action={sendWhatsAppAction} resetOnSuccess className="flex items-end gap-2 space-y-0">
        <input type="hidden" name="leadId" value={leadId} />
        <div className="flex gap-2">
          <input name="text" aria-label="Message" placeholder="Type a WhatsApp message…" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" />
          <Button type="submit" size="touch" aria-label="Send">
            <SendHorizontal />
          </Button>
        </div>
      </ActionForm>
    </div>
  )
}
