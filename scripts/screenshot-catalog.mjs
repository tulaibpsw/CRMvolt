// npm run ui:shots — saves /dev/ui screenshots (phone + desktop) into today's progress folder.
// Needs the dev server running: npm run dev   (override with CATALOG_URL=http://localhost:3100)
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.env.CATALOG_URL ?? 'http://localhost:3000'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
const outDir = process.argv[2] ?? `progress/${today}/screenshots`
mkdirSync(outDir, { recursive: true })

const pages = [
  ['catalog', '/dev/ui'],
  ['shell-agent', '/dev/ui/shell?role=agent'],
  ['shell-manager', '/dev/ui/shell?role=manager'],
]
const viewports = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
]

const browser = await chromium.launch()
for (const [vpName, viewport] of viewports) {
  const page = await browser.newPage({ viewport })
  for (const [name, path] of pages) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${outDir}/${name}-${vpName}.png`, fullPage: true })
    console.log(`saved ${outDir}/${name}-${vpName}.png`)
  }
  await page.close()
}
await browser.close()
