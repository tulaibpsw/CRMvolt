'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

export interface SearchBoxProps {
  placeholder?: string
  /** URL search param to write, e.g. ?q=… */
  paramKey?: string
  delayMs?: number
  className?: string
}

/** URL-driven search: debounces typing, then replaces ?q= so the Server Component re-renders. Wrap in <Suspense>. */
export function SearchBox({ placeholder = en.common.searchPlaceholder, paramKey = 'q', delayMs = 300, className }: SearchBoxProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get(paramKey) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function onChange(next: string) {
    setValue(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.trim()) params.set(paramKey, next.trim())
      else params.delete(paramKey)
      params.delete('page')
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }, delayMs)
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        inputMode="search"
        aria-label={en.common.search}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 ps-9 text-base md:text-sm"
      />
    </div>
  )
}
