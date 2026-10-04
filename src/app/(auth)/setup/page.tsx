import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { TextField } from '@/components/common/fields'
import { setupAction } from '@/server/actions'
import { connectDb } from '@/server/db/connection'
import { User } from '@/server/db/models'

export const metadata = { title: 'First-time setup' }

/** Creates the first admin. Needs MASTER_KEY from .env.local; disabled once an admin exists. */
export default async function SetupPage() {
  await connectDb()
  if (await User.exists({ role: 'admin', passwordHash: { $exists: true } })) redirect('/login')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Create the admin account</h1>
        <p className="text-sm text-muted-foreground">One time only. You need the master key from the server settings.</p>
      </div>
      <ActionForm action={setupAction}>
        <TextField label="Master key" name="masterKey" type="password" required />
        <TextField label="Your name" name="name" required />
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Username" name="username" required autoCapitalize="none" placeholder="admin" />
        <TextField label="Password (8+ characters)" name="password" type="password" minLength={8} required />
        <Button type="submit" size="touch" className="w-full">
          Create admin
        </Button>
      </ActionForm>
    </div>
  )
}
