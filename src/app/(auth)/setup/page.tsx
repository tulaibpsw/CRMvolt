import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { TextField } from '@/components/common/fields'
import { UsernameField } from '@/components/common/username-field'
import { setupAction } from '@/server/actions'
import { connectDb } from '@/server/db/connection'
import { User } from '@/server/db/models'

export const metadata = { title: 'First-time setup' }

/** Creates the first super admin. Needs MASTER_KEY; disabled once an admin exists (checked on every visit). */
export default async function SetupPage() {
  await connection()
  await connectDb()
  if (await User.exists({ role: { $in: ['admin', 'super_admin'] }, passwordHash: { $exists: true }, deletedAt: null })) redirect('/login')
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
        <UsernameField label="Username" />
        <TextField label="Password (8+ characters)" name="password" type="password" minLength={8} required />
        <Button type="submit" size="touch" className="w-full">
          Create admin
        </Button>
      </ActionForm>
    </div>
  )
}
