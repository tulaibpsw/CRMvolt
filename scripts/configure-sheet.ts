/**
 * One-off: connect a Google Sheet for a department (same as Settings → Google Sheets → Connect).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/configure-sheet.ts <sheet-link> [Tab1,Tab2] [INSTALLATION|TRADING] [name]
 */
import mongoose from 'mongoose'
import { DEPARTMENTS, type Department } from '@/domain/constants'
import { connectDb } from '@/server/db/connection'
import { getSheetSources, previewSheet, saveSheetSources, spreadsheetIdFrom } from '@/server/services/sheet'

async function main() {
  const [link, tabsArg = 'Leads', deptArg = 'INSTALLATION', ...nameParts] = process.argv.slice(2)
  if (!link) throw new Error('Usage: configure-sheet.ts <sheet-link> [Tabs] [INSTALLATION|TRADING] [name]')
  const department = deptArg.toUpperCase() as Department
  if (!DEPARTMENTS.includes(department)) throw new Error(`Department must be one of ${DEPARTMENTS.join(', ')}`)
  await connectDb()
  const spreadsheetId = spreadsheetIdFrom(link)
  const sources = await getSheetSources()
  const existing = sources.find((s) => s.spreadsheetId === spreadsheetId && s.department === department)
  const source = { id: existing?.id ?? 'legacy', name: nameParts.join(' ') || existing?.name || 'Main sheet', department, spreadsheetId, tabs: tabsArg.split(',').map((t) => t.trim()).filter(Boolean), headerOverrides: existing?.headerOverrides ?? {}, createdBy: null }
  await saveSheetSources([...sources.filter((s) => s.id !== source.id), source], 'script')
  for (const p of await previewSheet(source)) {
    console.log(`Tab ${p.tab}: ${p.rows} rows${p.error ? ` — ${p.error}` : ''}`)
    console.log('  mapped :', JSON.stringify(p.detection.mapping))
    console.log('  extra  :', JSON.stringify(p.detection.dynamic))
    console.log('  missing:', JSON.stringify(p.detection.missingRequired))
  }
}
main().then(() => mongoose.disconnect()).catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1) })
