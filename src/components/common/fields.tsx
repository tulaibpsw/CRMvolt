import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Labelled form fields (server-renderable). Use inside <ActionForm> or a plain <form action>. */

const control = 'h-11 text-base md:text-sm'

export function TextField({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string } & React.ComponentProps<'input'>) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} className={control} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TextAreaField({ label, name, className, ...props }: { label: string; name: string } & React.ComponentProps<'textarea'>) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} className="text-base md:text-sm" {...props} />
    </div>
  )
}

export function SelectField({
  label,
  name,
  options,
  placeholder,
  className,
  ...props
}: { label: string; name: string; options: { value: string; label: string }[]; placeholder?: string } & React.ComponentProps<'select'>) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        className={cn('w-full rounded-lg border border-input bg-card px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', control)}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckboxField({ label, name, defaultChecked, required }: { label: string; name: string; defaultChecked?: boolean; required?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} required={required} className="size-5 accent-primary" />
      {label}
    </label>
  )
}
