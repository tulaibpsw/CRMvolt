// Builds the PWA / home-screen icons from the logo: white logo on the navy brand square.
// Run: node scripts/make-icons.mjs  (re-run only when the logo changes)
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const INK = '#0c1a2b'
const GOLD = '#f7b500'
const out = 'public/icons'
mkdirSync(out, { recursive: true })

async function icon(size, file, { logoWidth, bar = true, radius = 0 }) {
  const logo = await sharp('public/brand/volton-logo.png').resize({ width: Math.round(size * logoWidth) }).toBuffer()
  const meta = await sharp(logo).metadata()
  const barH = Math.max(2, Math.round(size * 0.025))
  const barW = Math.round(size * logoWidth * 0.35)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${INK}"/>
    ${bar ? `<rect x="${(size - barW) / 2}" y="${(size + meta.height) / 2 + size * 0.05}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${GOLD}"/>` : ''}
  </svg>`
  await sharp(Buffer.from(svg))
    .composite([{ input: logo, top: Math.round((size - meta.height) / 2), left: Math.round((size - meta.width) / 2) }])
    .png()
    .toFile(`${out}/${file}`)
}

await icon(192, 'icon-192.png', { logoWidth: 0.78 })
await icon(512, 'icon-512.png', { logoWidth: 0.78 })
// Android "maskable": the logo must stay inside the centre safe circle (80%).
await icon(512, 'maskable-512.png', { logoWidth: 0.6 })
// iPhone home screen (iOS adds its own rounded corners).
await icon(180, 'apple-touch-icon.png', { logoWidth: 0.8 })
await icon(32, 'favicon-32.png', { logoWidth: 0.9, bar: false })
console.log('icons written to', out)
