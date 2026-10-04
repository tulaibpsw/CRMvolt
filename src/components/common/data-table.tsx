import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/common/states'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  sortable?: boolean
  align?: 'start' | 'end'
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** Current sort (from the URL). */
  sort?: { key: string; direction: SortDirection }
  /** Build the URL for sorting by a column — sorting happens on the server. */
  sortHref?: (key: string, direction: SortDirection) => string
  empty?: React.ReactNode
  caption?: string
  className?: string
}

/**
 * Server-friendly table (no client JS). Sorting and paging are URL-driven so the database does the work.
 * On phones, pages usually render a LeadCard list instead and hide this table below `md`.
 */
export function DataTable<T>({ columns, rows, getRowKey, sort, sortHref, empty, caption, className }: DataTableProps<T>) {
  if (rows.length === 0) return <>{empty ?? <EmptyState />}</>

  return (
    <div className={cn('overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10', className)}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const active = sort?.key === column.key
              const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
              const nextDirection: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc'
              const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
              return (
                <TableHead key={column.key} aria-sort={ariaSort} className={cn(column.align === 'end' && 'text-end', column.className)}>
                  {column.sortable && sortHref ? (
                    <Link
                      href={sortHref(column.key, nextDirection)}
                      aria-label={en.common.sortBy(column.header)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.header}
                      <Icon className="size-3.5" aria-hidden />
                    </Link>
                  ) : (
                    column.header
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key} className={cn(column.align === 'end' && 'text-end tabular-nums', column.className)}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
