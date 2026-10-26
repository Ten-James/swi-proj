// Exports the running deck to a PDF: one vector page per slide, all builds revealed.
// Usage: npm run build && npm run preview (in another terminal), then npm run pdf
//   DECK_URL     default http://localhost:4173
//   CHROME_PATH  default /usr/bin/google-chrome
//   OUT          default agent-reservations.pdf
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'

const DECK_URL = process.env.DECK_URL ?? 'http://localhost:4173'
const CHROME_PATH = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const OUT = process.env.OUT ?? 'agent-reservations.pdf'
const WIDTH = 1920
const HEIGHT = 1080
// Slides whose fragments replace each other: print these steps instead of the last one.
const EXTRA_STEPS = { 16: [3, 4] }

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })

async function slideCount() {
  await page.goto(DECK_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.frame-footer', { timeout: 120000 })
  const footer = await page.locator('.frame-footer span').last().innerText()
  return Number(footer.split('/')[1])
}

const total = await slideCount()
const merged = await PDFDocument.create()

for (let i = 0; i < total; i++) {
  for (const step of EXTRA_STEPS[i] ?? [99]) {
    await page.goto(`${DECK_URL}/?slide=${i}&step=${step}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.frame-footer', { timeout: 60000 })
    await page.waitForTimeout(1200)
    await page.emulateMedia({ media: 'screen' })
    const bytes = await page.pdf({
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    const part = await PDFDocument.load(bytes)
    const [copied] = await merged.copyPages(part, [0])
    merged.addPage(copied)
    process.stdout.write(`  slide ${i + 1}/${total} step ${step}\n`)
  }
}

fs.writeFileSync(OUT, await merged.save())
await browser.close()
console.log(`\n  Wrote ${OUT} (${merged.getPageCount()} pages)`)
