import { BrandLogo } from '@/components/common/brand-logo'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <BrandLogo height={44} priority />
        </div>
        <div className="rounded-2xl bg-card p-6 text-card-foreground shadow-lg">{children}</div>
      </div>
    </main>
  )
}
