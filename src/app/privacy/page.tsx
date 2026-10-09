import { BrandLogo } from '@/components/common/brand-logo'

export const metadata = { title: 'Privacy policy' }

/** Public page. Meta asks for a privacy policy link before the app can go Live (Lead Ads + WhatsApp). */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-6">
        <BrandLogo height={40} />
        <h1 className="font-heading text-2xl font-semibold">Privacy policy</h1>
        <p>This system is used by Volton Solar staff to answer people who asked us about solar systems.</p>
        <h2 className="font-heading text-lg font-semibold">What we collect</h2>
        <p>When you fill in one of our Facebook or Instagram forms, or message us on WhatsApp, we receive what you sent: your name, phone number, city and your answers or messages.</p>
        <h2 className="font-heading text-lg font-semibold">How we use it</h2>
        <p>Only to contact you about your enquiry, prepare a quotation and arrange a site visit. We do not sell or share your details with other companies.</p>
        <h2 className="font-heading text-lg font-semibold">Who can see it</h2>
        <p>Only Volton Solar staff who handle your enquiry, using a personal login.</p>
        <h2 className="font-heading text-lg font-semibold">Deleting your data</h2>
        <p>Ask us on WhatsApp or by phone to delete your details and we will remove them.</p>
      </article>
    </main>
  )
}
