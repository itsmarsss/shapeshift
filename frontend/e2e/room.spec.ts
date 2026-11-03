import { expect, test, type Browser } from '@playwright/test'
import { openEditor } from './helpers'

async function person(browser: Browser) {
  const page = await (await browser.newContext()).newPage()
  await page.addInitScript(() => localStorage.setItem('shapeshift-onboarded', '1'))
  return page
}

test('people in a live room can chat with each other', async ({ browser }) => {
  const host = await person(browser)
  await openEditor(host)
  await host.getByTitle('Share a live link to this scene').click()
  await expect(host).toHaveURL(/room=/)
  await expect(host.getByTitle('Chat with people in this room')).toBeVisible()

  const guest = await person(browser)
  await guest.goto(host.url())
  await expect(guest.getByTitle('Chat with people in this room')).toBeVisible()

  await host.getByTitle('Chat with people in this room').click()
  await host.getByLabel('Message the room').fill('Hi! Try the snowman')
  await host.getByLabel('Message the room').press('Enter')
  await expect(host.getByRole('dialog', { name: 'Room chat' })).toContainText('Hi! Try the snowman')

  // The guest gets a preview and a count while their chat is closed.
  await expect(guest.getByText('Hi! Try the snowman')).toBeVisible()
  await expect(guest.getByLabel('1 new')).toBeVisible()
  await guest.getByTitle('Chat with people in this room').click()
  await expect(guest.getByRole('dialog', { name: 'Room chat' })).toContainText('Hi! Try the snowman')
  await expect(guest.getByLabel('1 new')).toHaveCount(0)
})
