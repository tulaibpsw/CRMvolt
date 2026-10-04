import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { TextField } from '@/components/common/fields'
import { getSessionUser } from '@/server/auth/session'
import { loginAction } from '@/server/actions'
import { connectDb } from '@/server/db/connection'
import { User } from '@/server/db/models'

export const metadata = { title: 'Sign in' }

export default async function LoginPage(props: PageProps<'/login'>) {
  if (await getSessionUser()) redirect('/dashboard')
  const { next } = await props.searchParams
  await connectDb()
  const needsSetup = !(await User.exists({ role: 'admin', passwordHash: { $exists: true } }))
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Sign in</h1>
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={typeof next === 'string' ? next : ''} />
        <TextField label="Username or email" name="login" autoComplete="username" required autoCapitalize="none" />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" size="xl" className="w-full">
          Sign in
        </Button>
      </ActionForm>
      {needsSetup ? (
        <p className="text-center text-sm text-muted-foreground">
          First time? <Link href="/setup" className="font-medium text-foreground underline">Create the admin account</Link>
        </p>
      ) : null}
    </div>
  )
}
