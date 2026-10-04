'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { DEPARTMENTS, LEAD_CHANNELS } from '@/domain/constants'
import { CHANNEL_META, DEPARTMENT_META } from '@/domain/ui-maps'
import { quickAddLeadAction } from '@/server/actions'

/** Mobile quick-add (walk-ins, phone calls, WhatsApp-ad chats before the number is connected). Duplicate-safe. */
export function QuickAddLead({ defaultDepartment }: { defaultDepartment?: string | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="touch">
          <Plus data-icon="inline-start" />
          Add lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
        </DialogHeader>
        <ActionForm action={quickAddLeadAction}>
          <TextField label="Customer name" name="name" required autoComplete="off" />
          <TextField label="Phone / WhatsApp" name="phone" required inputMode="tel" placeholder="0300 1234567" />
          <TextField label="City" name="city" />
          <SelectField label="Department" name="department" defaultValue={defaultDepartment ?? 'INSTALLATION'} options={DEPARTMENTS.map((d) => ({ value: d, label: DEPARTMENT_META[d].label }))} />
          <SelectField label="Source" name="channel" defaultValue="manual" options={LEAD_CHANNELS.filter((c) => c !== 'csv_import' && c !== 'meta_webhook').map((c) => ({ value: c, label: CHANNEL_META[c].label }))} />
          <TextField label="Campaign / ad (optional)" name="sourceDetail" />
          <TextAreaField label="Notes" name="notes" rows={2} />
          <Button type="submit" size="touch" className="w-full">
            Save lead
          </Button>
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
