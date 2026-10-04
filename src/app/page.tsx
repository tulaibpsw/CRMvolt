import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/common/brand-logo'
import { en } from '@/i18n/en'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-6 px-4">
      <BrandLogo height={40} surface="tile" priority />
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold">{en.home.title}</h1>
        <p className="text-muted-foreground">{en.home.description}</p>
      </div>
      <Button asChild size="touch">
        <Link href="/dev/ui">{en.home.openCatalog}</Link>
      </Button>
    </main>
  )
}
