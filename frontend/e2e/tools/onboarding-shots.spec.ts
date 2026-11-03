import { expect, test, type Browser, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Retakes the pictures in the welcome dialog (public/onboarding), in light and
// dark, from the app as it is now. Not part of the test run:
//   SHOTS=1 CI=true npx playwright test e2e/tools/onboarding-shots.spec.ts --project=desktop
// then convert the PNGs it saves (in the system temp folder, or SHOTS_OUT) to
// 1120x640 WebP in public/onboarding.
test.skip(!process.env.SHOTS, 'Only when retaking the welcome pictures')
test.setTimeout(240_000)
// A fake camera for hand control.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const OUT = process.env.SHOTS_OUT ?? path.join(os.tmpdir(), 'shapeshift-onboarding')
const VIEW = { width: 1200, height: 700 }
// 7:4, like the picture area in the dialog.
const CLIP = { width: 1008, height: 576 }
fs.mkdirSync(OUT, { recursive: true })

async function person(browser: Browser, theme: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: theme })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('shapeshift-onboarded', '1')
    localStorage.setItem('shapeshift-first-steps', JSON.stringify({ active: false, done: [] }))
  })
  return page
}

async function open(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByTitle('Add box')).toBeVisible()
  await page.waitForTimeout(1500)
}

// The snowman template, as the "add" steps an assistant would take to build it.
type Shape = { name: string; geometry: { type: string }; position: number[]; rotation: number[]; scale: number[]; material: { color: string }; group?: string }
async function snowmanSteps(browser: Browser) {
  const page = await person(browser, 'light')
  await open(page, '/edit?template=snowman')
  const doc = await page.evaluate(() => JSON.parse(localStorage.getItem('shapeshift-scene')!) as { objects: Shape[] })
  await page.context().close()
  return doc.objects.map((o) => ({ type: 'add', primitive: o.geometry.type, name: o.name, geometry: o.geometry, position: o.position, rotation: o.rotation, scale: o.scale, color: o.material.color }))
}

// The assistant, scripted: it thinks, builds the snowman step by step, then sums up.
async function scriptAssistant(page: Page, snowman: object[]) {
  let step = 0
  await page.route('**/api/agent', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { provider: 'anthropic', model: 'claude-sonnet-5-5' } })
    const lines: object[] = []
    if (step === 0) {
      lines.push({ type: 'thinking', text: 'Three stacked spheres, a top hat and a carrot nose, on a patch of snow.' })
      const calls = snowman.map((c, i) => {
        const { type, ...args } = c as { type: string }
        return { id: `call_${i}`, name: type, arguments: JSON.stringify(args) }
      })
      lines.push({ type: 'message', message: { role: 'assistant', content: null, tool_calls: calls }, stop: 'tool_use', model: 'claude-sonnet-5-5' })
    } else {
      const summary = 'Built a snowman with a top hat, a carrot nose, a red scarf and stick arms, on a snowy patch with a pine beside it.'
      lines.push({ type: 'text', text: summary })
      lines.push({
        type: 'message',
        message: { role: 'assistant', content: 'Built a snowman with a top hat, a carrot nose, a red scarf and stick arms, on a snowy patch with a pine beside it.' },
        stop: 'end',
        model: 'claude-sonnet-5-5',
      })
    }
    step++
    await route.fulfill({ contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' })
  })
}

// Hand control on a fake camera, with recorded hands replayed into it.
const HANDS = JSON.parse(fs.readFileSync('src/hands/fixtures/two-open-hands.json', 'utf8')) as { time: number; hands: unknown[] }[]
// The recording is a moment long; hold its last pose for a few seconds.
// Raised a little in the frame too, so the palm menu fits in the picture.
type Frame = { handedness: string; landmarks: number[] }
const raise = (hands: unknown[]) => (hands as Frame[]).map((h) => ({ ...h, landmarks: h.landmarks.map((v, i) => (i % 3 === 1 ? v - 0.22 : v)) }))
const held = [...HANDS, ...Array.from({ length: 400 }, (_, i) => ({ time: HANDS.at(-1)!.time + (i + 1) * 33, hands: HANDS.at(-1)!.hands }))].map((f) => ({ ...f, hands: raise(f.hands) }))

for (const theme of ['light', 'dark'] as const) {
  test(`hands ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: theme, permissions: ['camera'] })
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('shapeshift-onboarded', '1')
      localStorage.setItem('shapeshift-first-steps', JSON.stringify({ active: false, done: [] }))
    })
    await open(page, '/edit?record&template=snowman')
    await page.getByTitle('Turn on hand control').click()
    await expect(page.getByTitle('Replay a recording')).toBeVisible({ timeout: 150_000 })
    const chooser = page.waitForEvent('filechooser')
    await page.getByTitle('Replay a recording').click()
    await (await chooser).setFiles({ name: 'hands.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(held)) })
    // The fake camera's test pattern isn't worth showing.
    await page.addStyleTag({ content: 'div:has(> div > canvas[width="424"]) { display: none !important; }' })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/hands-${theme}.png`, clip: { x: VIEW.width - CLIP.width, y: 48, ...CLIP } })
    await context.close()
  })


  test(`assistant ${theme}`, async ({ browser }) => {
    const page = await person(browser, theme)
    await scriptAssistant(page, await snowmanSteps(browser))
    await open(page, '/edit?new')
    await page.waitForTimeout(500)
    await page.getByTitle('Assistant').click()
    await page.getByLabel('Message the assistant').fill('Build a snowman with a hat and a carrot nose')
    await page.getByLabel('Message the assistant').press('Enter')
    await expect(page.getByText('Built a snowman with a top hat')).toBeVisible({ timeout: 60_000 })
    // Nothing selected, and the whole snowman in view.
    await page.locator('canvas').first().click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Escape')
    await page.getByTitle('Fit everything in view (F)').click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/assistant-${theme}.png`, clip: { x: VIEW.width - CLIP.width - 12, y: 48, ...CLIP } })
  })

  test(`shapes ${theme}`, async ({ browser }) => {
    const page = await person(browser, theme)
    await open(page, '/edit?template=house')
    await page.getByTitle('Inspector').click()
    // Just the tree's leaves, picked from the list.
    await page.locator('select').first().selectOption({ label: 'Leaves' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/shapes-${theme}.png`, clip: { x: 0, y: 48, ...CLIP } })
  })

  test(`together ${theme}`, async ({ browser }) => {
    const host = await person(browser, theme)
    await open(host, '/edit?template=cabin')
    await host.getByTitle('Share a live link to this scene').click()
    await expect(host).toHaveURL(/room=/)
    const guests = [await person(browser, theme), await person(browser, theme)]
    for (const guest of guests) {
      await guest.goto(host.url())
      await expect(guest.getByTitle('Add box')).toBeVisible()
    }
    // A little closer than the fit, so the cabin fills the picture.
    const view = (await host.locator('canvas').first().boundingBox())!
    await host.mouse.move(view.x + view.width / 2, view.y + view.height * 0.6)
    for (let i = 0; i < 6; i++) {
      await host.mouse.wheel(0, -120)
      await host.waitForTimeout(150)
    }
    await host.waitForTimeout(2000)
    // Each guest points somewhere in the scene, so their cursors show.
    const spots = [
      [0.42, 0.45],
      [0.66, 0.6],
    ]
    for (const [i, guest] of guests.entries()) {
      const box = (await guest.locator('canvas').first().boundingBox())!
      await guest.mouse.move(box.x + box.width * spots[i][0], box.y + box.height * spots[i][1], { steps: 8 })
    }
    await host.keyboard.press('Escape')
    await host.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await host.mouse.move(5, 300)
    await host.waitForTimeout(2500)
    await host.screenshot({ path: `${OUT}/together-${theme}.png`, clip: { x: VIEW.width - CLIP.width, y: 0, ...CLIP } })
  })
}
