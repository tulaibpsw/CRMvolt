import { MESSAGE_STATUS_META } from '@/domain/ui-maps'
import type { MessageView } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatPktTime } from '@/lib/dates-pkt'
import { cn } from '@/lib/utils'
import { toneTextClass } from '@/components/common/status-badge'

/** WhatsApp message on the lead timeline / chat panel. Outgoing messages show who sent them and how. */
export function MessageBubble({ message }: { message: MessageView }) {
  const outgoing = message.direction === 'out'
  const status = MESSAGE_STATUS_META[message.status]
  const StatusIcon = status.icon
  return (
    <div className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] space-y-1 rounded-2xl px-3 py-2 text-sm',
          outgoing ? 'rounded-ee-sm bg-tone-success-soft text-tone-success-soft-foreground' : 'rounded-es-sm bg-muted text-foreground',
        )}
      >
        {outgoing && message.senderName ? (
          <p className="text-xs font-medium opacity-80">
            {message.senderName} · {message.sentFrom === 'app' ? en.message.viaPhone : en.message.viaCrm}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{message.text}</p>
        <p className="flex items-center justify-end gap-1 text-[11px] opacity-80 tabular-nums">
          {formatPktTime(new Date(message.at))}
          {outgoing && StatusIcon ? <StatusIcon className={cn('size-3.5', message.status === 'read' && toneTextClass.info)} aria-label={status.label} /> : null}
        </p>
      </div>
    </div>
  )
}
