import { NextResponse, type NextRequest } from 'next/server'
import { Types } from 'mongoose'
import { getSessionUser } from '@/server/auth/session'
import { isAdminRole } from '@/server/auth/scope'
import { connectDb } from '@/server/db/connection'
import { ContactAttempt, DocumentFile, Lead } from '@/server/db/models'
import { privateDownloadUrl } from '@/server/services/cloudinary'

/** Role-checked redirect to a short-lived signed Cloudinary link. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/documents/[id]'>) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await connectDb()
  const doc = await DocumentFile.findOne({ _id: id, deletedAt: null }).lean()
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const leadId = doc.ownerType === 'attempt' ? (await ContactAttempt.findById(doc.ownerId).select('leadId').lean())?.leadId : doc.ownerId
  const lead = leadId ? await Lead.findById(leadId).select('departmentId assignment').lean() : null
  const allowed =
    isAdminRole(user.role) ||
    (user.role === 'manager' && String(lead?.departmentId) === user.departmentId) ||
    (user.role === 'agent' && String(lead?.assignment?.agentId) === user.id) ||
    String(doc.uploadedBy) === user.id
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const format = /^image\/(jpe?g|png|webp|heic)$/.test(doc.mime) ? doc.mime.split('/')[1].replace('jpeg', 'jpg') : 'jpg'
  return NextResponse.redirect(privateDownloadUrl(doc.storageKey, format))
}
