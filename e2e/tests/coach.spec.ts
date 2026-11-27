import { expect, type Page, test } from '@playwright/test';

// Coach end to end: UI → /api/v1/coach (streamed) → agent tools → Postgres, with Undo and Apply.
// These need the API's scripted model (COACH_MODEL=fake, as in CI) and skip otherwise, so they
// never spend real API credits. A fake microphone lets the voice-note flow run headless.
test.use({
  serviceWorkers: 'block',
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

// One chat at a time: these tests start, switch and reopen chats.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  const s = await (await request.get('/api/v1/coach/status')).json();
  test.skip(!s.scripted, 'needs the API running with COACH_MODEL=fake');
});

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message Coach' });
const thread = (page: Page) => page.getByRole('log', { name: 'Conversation' });
const lastReply = (page: Page) => thread(page).locator('[data-role="coach"]').last();
const snapshot = async (page: Page) => (await page.request.get('/api/data')).json();

/** Start a fresh chat and say something. */
async function say(page: Page, text: string) {
  await composer(page).fill(text);
  await page.keyboard.press('Enter');
}
async function freshChat(page: Page) {
  await page.goto('/');
  await page.locator('[data-coach-menu]').click();
  await page.locator('[data-new-chat]').click();
  await expect(thread(page)).toContainText("Hi, I'm Coach.");
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Coach is an open column beside the board, its message box on screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-coach="column"]')).toBeVisible();
    const box = await page.locator('[data-coach-composer]').boundingBox();
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });

  test('logging: a weigh-in saves at once and Undo removes it', async ({ page }) => {
    await freshChat(page);
    // A past day of its own, so tests running alongside (which log today) can't interfere.
    const s0 = await snapshot(page);
    const d = new Date(`${s0.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 25);
    const day = d.toISOString().slice(0, 10);
    const before = s0.days[day]?.weight ?? null;
    const lb = (150 + Math.round(Math.random() * 90) / 10).toFixed(1);
    await say(page, `log weight ${lb} on ${day}`);
    const receipt = lastReply(page).locator('[data-receipt="applied"][data-tool="log_weight"]');
    await expect(receipt).toContainText(`Logged ${lb} lb`);
    expect((await snapshot(page)).days[day].weight).toBe(Number(lb));

    await receipt.getByRole('button', { name: 'Undo' }).click();
    await expect(lastReply(page).locator('[data-receipt="undone"]')).toBeVisible();
    expect((await snapshot(page)).days[day]?.weight ?? null).toBe(before);
  });

  test('changing a past record is proposed; Cancel leaves it alone', async ({ page }) => {
    await freshChat(page);
    const s0 = await snapshot(page);
    const d = new Date(`${s0.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    const day = d.toISOString().slice(0, 10);
    await say(page, `log weight 149.9 on ${day}`);
    await expect(lastReply(page).locator('[data-receipt="applied"]')).toBeVisible();
    await say(page, `delete my last weigh-in on ${day}`);
    const proposal = lastReply(page).locator('[data-receipt="pending"][data-tool="delete_record"]');
    await expect(proposal).toContainText('Delete the weigh-in on');
    await expect(proposal).toContainText('(149.9 lb)');
    await proposal.getByRole('button', { name: 'Cancel' }).click();
    await expect(lastReply(page).locator('[data-receipt="cancelled"]')).toBeVisible();
    expect((await snapshot(page)).days[day].weight).toBe(149.9);
  });

  test('a photo goes with the message and is kept with the chat', async ({ page }) => {
    await freshChat(page);
    await page
      .locator('[data-coach-photos]')
      .setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Attached' })).toHaveCount(1);
    await say(page, 'I had a chicken salad for lunch');
    await expect(
      lastReply(page).locator('[data-receipt="applied"][data-tool="log_meal"]'),
    ).toContainText('Logged lunch (today): a chicken salad');
    // Reopened later, the photo comes from the server.
    await page.reload();
    await page.locator('[data-coach-menu]').click();
    await page
      .getByRole('menuitem', { name: /I had a chicken salad for lunch/ })
      .first()
      .click();
    const img = thread(page).getByRole('img', { name: 'Sent' }).last();
    await expect(img).toHaveAttribute('src', /\/api\/v1\/coach\/attachments\//);
    await expect
      .poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
      .toBeGreaterThan(0);
  });

  test('full-size photos are accepted (not just thumbnails)', async ({ page }) => {
    await page.goto('/');
    // ~300 KB, like a phone photo after the app shrinks it.
    const buffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300_000, 7)]);
    const r = await page.request.post('/api/v1/coach/send', {
      headers: { 'x-heroarc': '1' },
      multipart: {
        text: 'hello',
        'images[0]': { name: 'meal.jpg', mimeType: 'image/jpeg', buffer },
      },
    });
    expect(r.status()).toBe(200);
  });

  test('a voice note is transcribed and answered', async ({ page }) => {
    await freshChat(page);
    await page.locator('[data-coach-mic]').click();
    await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(1200);
    await page.locator('[data-rec-done]').click();
    await expect(page.locator('[data-voice-note]')).toBeVisible();
    await page.locator('[data-coach-send]').click();
    await expect(thread(page).locator('[data-role="user"]').last()).toContainText(
      'This is a test voice note.',
    );
    await expect(lastReply(page)).toContainText('This is a test voice note.');
  });

  test('Coach can show a day on the board', async ({ page }) => {
    await freshChat(page);
    const s = await snapshot(page);
    const d = new Date(`${s.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 3);
    const day = d.toISOString().slice(0, 10);
    await say(page, `show ${day}`);
    await expect(page.locator('h1')).not.toHaveText('Today');
    await expect(page.getByRole('textbox', { name: 'Day' })).toHaveValue(day);
  });

  test('notes: Coach remembers, and you can see and remove what it keeps', async ({ page }) => {
    await freshChat(page);
    const fact = `I train in the mornings ${Date.now()}`;
    await say(page, `remember ${fact}`);
    await expect(
      lastReply(page).locator('[data-receipt="applied"][data-tool="remember"]'),
    ).toBeVisible();
    await page.locator('[data-coach-menu]').click();
    await page.getByRole('menuitem', { name: 'What Coach remembers' }).click();
    const sheet = page.getByRole('dialog', { name: 'What Coach remembers' });
    await expect(sheet).toContainText(fact);
    await sheet
      .locator('[data-note]')
      .filter({ hasText: fact })
      .getByRole('button', { name: 'Forget' })
      .click();
    await expect(sheet).not.toContainText(fact);
  });

  test('chats are saved: start a new one, then reopen the earlier one', async ({ page }) => {
    await freshChat(page);
    const marker = `marker ${Date.now()}`;
    await say(page, marker);
    await expect(lastReply(page)).toContainText(marker);
    await page.locator('[data-coach-menu]').click();
    await page.locator('[data-new-chat]').click();
    await expect(thread(page)).not.toContainText(marker);
    await page.locator('[data-coach-menu]').click();
    await page.getByRole('menuitem', { name: new RegExp(marker) }).click();
    await expect(thread(page)).toContainText(marker);
  });

  test('/ from anywhere puts the cursor in the message box', async ({ page }) => {
    await page.goto('/');
    await page.locator('h1').click();
    await page.keyboard.press('/');
    await expect(composer(page)).toBeFocused();
  });

  test('photos: up to four per message', async ({ page }) => {
    await page.goto('/');
    const files = Array.from({ length: 5 }, (_, i) => ({
      name: `p${i}.png`,
      mimeType: 'image/png',
      buffer: PNG,
    }));
    await page.locator('[data-coach-photos]').setInputFiles(files);
    const panel = page.locator('[data-coach="column"]');
    await expect(panel.getByRole('img', { name: 'Attached' })).toHaveCount(4);
    await expect(panel).toContainText('Up to 4 photos per message.');
  });

  test('collapsing Coach is remembered on this device', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Collapse Coach' }).click();
    await expect(page.locator('[data-coach="rail"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-coach="rail"]')).toBeVisible();
    await page.getByRole('button', { name: 'Open Coach' }).click();
    await expect(page.locator('[data-coach="column"]')).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Coach is the first quick action and logs from a full-screen sheet', async ({ page }) => {
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Quick actions' });
    await expect(dock.getByRole('button').first()).toHaveText('Coach');
    await dock.getByRole('button', { name: 'Coach' }).click();
    const sheet = page.getByRole('dialog', { name: 'Coach' });
    const s = await snapshot(page);
    const d = new Date(`${s.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 26);
    await sheet
      .getByRole('textbox', { name: 'Message Coach' })
      .fill(`log weight 152.3 on ${d.toISOString().slice(0, 10)}`);
    await sheet.locator('[data-coach-send]').click();
    const receipt = sheet.locator('[data-receipt="applied"][data-tool="log_weight"]').last();
    await expect(receipt).toContainText('Logged 152.3 lb');
    await receipt.getByRole('button', { name: 'Undo' }).click();
    await expect(sheet.locator('[data-receipt="undone"]').last()).toBeVisible();
  });
});
