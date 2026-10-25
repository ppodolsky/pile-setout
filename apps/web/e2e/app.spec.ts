import { expect, test, type Page } from '@playwright/test';

/** Opens `route` on a clean device (storage cleared, app started fresh). */
const fresh = async (page: Page, route: string) => {
  await page.goto(`./#${route}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
};

const noHorizontalOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test.describe('field work', () => {
  test('suggests measurements, builds a move plan and keeps it after reload', async ({ page, isMobile }) => {
    await fresh(page, '/piles/fieldwork');
    await expect(page.getByText('Next to measure')).toBeVisible();
    await expect(page.getByText('Field fixed:')).toContainText('0');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('[data-reading]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Demo errors' }).click();
    if (isMobile) await page.getByRole('button', { name: 'Move plan' }).click();
    await expect(page.getByText(/out of 4 measured piles|All measured piles are within tolerance/)).toBeVisible();
    await expect(page.getByText('On the string C1 → C3').first()).toBeVisible();
    await noHorizontalOverflow(page);

    const readings = await page.locator('[data-reading]').count();
    await page.reload();
    await expect(page.locator('[data-reading]')).toHaveCount(readings);
  });

  test('subtracts corrections at both ends and offers a pile’s previous one', async ({ page }) => {
    await fresh(page, '/piles/fieldwork');
    await page.getByRole('button', { name: 'Add', exact: true }).click(); // C1 ↔ C3
    await page.locator('[data-reading]').first().fill('6058');
    await page.getByLabel('Correction at C1, mm').fill('100');
    await expect(page.getByText('= 5,958')).toBeVisible();
    await page.getByLabel('Correction at C3, mm').fill('50');
    await expect(page.getByText('= 5,908')).toBeVisible();

    // a new measurement from C1 starts empty but offers C1's correction
    await page.getByRole('button', { name: 'Add', exact: true }).click(); // C4 ↔ C6
    await page.locator('[data-reading]').nth(1).fill('5858');
    const firstPile = page.getByLabel('First pile').nth(1);
    await firstPile.selectOption({ label: 'C1' });
    await expect(page.getByLabel('Correction at C1, mm').nth(1)).toHaveValue('');
    await page.getByRole('button', { name: 'use 100' }).click();
    await expect(page.getByLabel('Correction at C1, mm').nth(1)).toHaveValue('100');
  });

  test('flags a misread tape', async ({ page }) => {
    await fresh(page, '/piles/fieldwork');
    await page.getByRole('radio', { name: 'Measure', exact: true }).click(); // all piles measured → more checks
    await page.getByRole('button', { name: 'Fill design values' }).click();
    const first = page.locator('[data-reading]').first();
    const v = Number(await first.inputValue());
    await first.fill(String(v + 40));
    await expect(page.getByText('Re-measure').first()).toBeVisible();
  });
});

test.describe('design (constraint sketch)', () => {
  test('template is a fully constrained sketch', async ({ page }) => {
    await fresh(page, '/piles/design');
    await expect(page.getByText('fully constrained').first()).toBeVisible();
    await page.getByRole('button', { name: "10'" }).first().click();
    await expect(page.getByText('Piles (8)')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('a new pile constrained to another by distance + angle', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer placement is covered on desktop');
    await fresh(page, '/piles/design');
    const canvas = page.getByRole('img', { name: 'Pile design' });
    await expect(canvas.getByText('C1', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'New pile' }).click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.1);
    await expect(page.getByText('Pile C7')).toBeVisible();
    await expect(page.getByText('can still move')).toBeVisible();

    await page.getByRole('radio', { name: 'Select & move' }).click();
    await page.locator('[data-pile="C6"]').click({ modifiers: ['Shift'] });
    await expect(page.getByText('2 piles', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Distance + angle' }).click();
    await expect(page.getByText('2 constraints between them')).toBeVisible();

    await page.locator('[data-pile="C7"]').click();
    await expect(page.getByText('fully constrained').first()).toBeVisible();
  });

  test('editing a dimension moves the piles that depend on it; undo restores', async ({ page }) => {
    await fresh(page, '/piles/design');
    await page.getByText('ΔX 5,858').click();
    const value = page.getByLabel('ΔX value');
    await value.fill('6000');
    await expect(page.getByText('6,100, 100')).toBeVisible(); // C3 moved
    await expect(page.getByText('3,100, 100')).toBeVisible(); // C2 stays the midpoint
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('5,958, 100')).toBeVisible();
  });

  test('multi-select toggle picks several piles without a keyboard', async ({ page }) => {
    await fresh(page, '/piles/design');
    await page.getByRole('button', { name: 'Multi-select' }).click();
    await page.locator('[data-pile="C1"]').click();
    await page.locator('[data-pile="C4"]').click();
    await expect(page.getByText('2 piles', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New pile in the middle' })).toBeVisible();
  });

  test('a midpoint pile is set out on the string in field work', async ({ page }) => {
    await fresh(page, '/piles/design');
    await page.getByRole('button', { name: /^C1\b/ }).click();
    await page.getByRole('button', { name: /^C4\b/ }).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'New pile in the middle' }).click();
    await expect(page.getByText('Piles (7)')).toBeVisible();
    await page.getByRole('link', { name: 'Field work' }).click();
    await page.getByRole('button', { name: 'Demo errors' }).click();
    if ((page.viewportSize()?.width ?? 1000) < 1024) await page.getByRole('button', { name: 'Move plan' }).click();
    await expect(page.getByText('C1 → C4').first()).toBeVisible();
  });
});

test('migrates a session saved by the first version', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'pile-setout/v1',
      JSON.stringify({
        preset: 'c20',
        containers: ['10', '20'],
        head: 200,
        inset: 0,
        midMode: 'derived',
        piles: [
          { label: 'C1', x: 100, y: 100 },
          { label: 'C2', x: 3029, y: 100, mid: { a: 'C1', b: 'C3' } },
          { label: 'C3', x: 5958, y: 100 },
          { label: 'C4', x: 100, y: 2338 },
          { label: 'C5', x: 3029, y: 2338, mid: { a: 'C4', b: 'C6' } },
          { label: 'C6', x: 5958, y: 2338 },
        ],
        meas: [{ a: 'C1', b: 'C3', value: 5880, corr: 22, end: 'a' }],
        tol: 3,
        exagg: 10,
        showEdges: true,
        pinned: [],
      }),
    );
  });
  await page.goto('./#/piles/fieldwork');
  await page.reload(); // start the app again with only the old save present
  await expect(page.locator('[data-reading]')).toHaveCount(1);
  await expect(page.locator('[data-reading]').first()).toHaveValue('5880');
  await expect(page.getByText('= 5,858')).toBeVisible();
});

test('reopens in the mode used last', async ({ page }) => {
  await fresh(page, '/piles/fieldwork');
  await expect(page.getByText('Next to measure')).toBeVisible();
  await page.goto('./');
  await expect(page).toHaveURL(/#\/piles\/fieldwork$/);
});
