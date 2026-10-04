/** One-off: npm exec tsx --conditions=react-server --env-file=.env.local scripts/configure-sheet.ts <sheet-link> [Tab:DEPT,...] */
import mongoose from 'mongoose'
import { connectDb } from '@/server/db/connection'
import { setSetting, getSetting } from '@/server/services/settings'
import { previewSheet, spreadsheetIdFrom } from '@/server/services/sheet'

async function main() {
  const [link, tabsArg = 'Leads:INSTALLATION'] = process.argv.slice(2)
  await connectDb()
  const current = await getSetting('sheet_config')
  const tabs = tabsArg.split(',').map((t) => {
    const [name, department] = t.split(':')
    return department ? { name, department: department as 'INSTALLATION' | 'TRADING' } : { name }
  })
  await setSetting('sheet_config', { ...current, spreadsheetId: spreadsheetIdFrom(link), tabs })
  for (const p of await previewSheet()) {
    console.log(`Tab ${p.tab}: ${p.rows} rows`)
    console.log('  mapped :', JSON.stringify(p.detection.mapping))
    console.log('  extra  :', JSON.stringify(p.detection.dynamic))
    console.log('  missing:', JSON.stringify(p.detection.missingRequired))
  }
}
main().then(() => mongoose.disconnect()).catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1) })
