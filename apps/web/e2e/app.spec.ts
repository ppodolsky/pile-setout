import { readFileSync } from 'node:fs';
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

  test('after moving a pile, its readings come back to be re-measured', async ({ page, isMobile }) => {
    await fresh(page, '/piles/fieldwork');
    await page.getByRole('button', { name: 'Demo errors' }).click();
    if (isMobile) await page.getByRole('button', { name: 'Move plan' }).click();
    await page.getByRole('button', { name: 'I moved it' }).first().click();
    await page
      .getByRole('button', { name: /Re-measure \d+ readings?/ })
      .first()
      .click();
    // jumps to the Measure panel (phones) with the first reading to redo focused
    const focused = page.locator('[data-reading]:focus');
    await expect(focused).toBeVisible();
    await expect(focused).toHaveAttribute('placeholder', /^was /);
    await expect(page.getByText('Re-measure after moving')).toBeVisible();
    if (isMobile) await expect(page.getByText(/design ≈ [\d,]+ mm/).first()).toBeVisible(); // pinned strip shows the pair
    await focused.fill('5858');
    await expect(page.locator('[data-reading]:focus')).toHaveValue('5858');
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
    await page.locator('[data-point="C6"]').click({ modifiers: ['Shift'] });
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Distance + angle' }).click();
    // placement already snapped it vertical with C5 (auto-constraint), so only what's missing is added
    await expect(page.getByText(/constraints? between them/)).toBeVisible();

    await page.locator('[data-point="C7"]').click();
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

  test('dragging a fully constrained pile drives its dimension', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag is covered on desktop');
    await fresh(page, '/piles/design');
    const c3 = page.locator('[data-point="C3"]');
    const box = (await c3.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 8 });
    await page.mouse.up();
    // still on the row axis (y = 100) and the ΔX dimension follows the drag
    await expect(page.getByText(/^[0-9,]+, 100$/).nth(2)).toBeVisible();
    await expect(page.getByText('ΔX 5,858')).toHaveCount(0);
    await expect(page.getByText('fully constrained').first()).toBeVisible();
  });

  test('draws a line between two piles and constrains it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer drawing is covered on desktop');
    await fresh(page, '/piles/design');
    await page.getByRole('radio', { name: /^Line/ }).click();
    await page.locator('[data-point="C1"]').click();
    await page.locator('[data-point="C6"]').click();
    await page.keyboard.press('Escape'); // stop the line
    await page.keyboard.press('Escape'); // back to select
    await page.locator('[data-line]').last().click({ force: true });
    await expect(page.getByText('Line', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Length' }).click();
    // the plan is fully constrained, so its length is already determined — nothing is over-constrained
    await expect(page.getByText('Nothing added — already determined by other constraints.')).toBeVisible();
  });

  test('multi-select toggle picks several piles without a keyboard', async ({ page }) => {
    await fresh(page, '/piles/design');
    await page.getByRole('button', { name: 'Multi-select' }).click();
    await page.locator('[data-point="C1"]').click();
    await page.locator('[data-point="C4"]').click();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New in the middle' })).toBeVisible();
  });

  test('a midpoint pile is set out on the string in field work', async ({ page }) => {
    await fresh(page, '/piles/design');
    await page.getByRole('button', { name: /^C1\b/ }).click();
    await page.getByRole('button', { name: /^C4\b/ }).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'New in the middle' }).click();
    await expect(page.getByText('Piles (7)')).toBeVisible();
    await page.getByRole('link', { name: 'Field work' }).click();
    await page.getByRole('button', { name: 'Demo errors' }).click();
    if ((page.viewportSize()?.width ?? 1000) < 1024) await page.getByRole('button', { name: 'Move plan' }).click();
    await expect(page.getByText('C1 → C4').first()).toBeVisible();
  });
});

test('keeps a library of named sketches', async ({ page }) => {
  await fresh(page, '/piles/design');
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('menuitem', { name: 'Sketches…' }).click();
  await page.getByLabel('This sketch').fill('Garage');
  await page.getByRole('button', { name: 'New sketch' }).click();
  await page.getByLabel('This sketch').fill('Shed');
  await expect(page.getByText('Garage')).toBeVisible();
  await page.getByRole('button', { name: 'Open Garage' }).click();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('menuitem', { name: 'Sketches…' }).click();
  await expect(page.getByLabel('This sketch')).toHaveValue('Garage');
  await page.reload();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('menuitem', { name: 'Sketches…' }).click();
  await expect(page.getByLabel('This sketch')).toHaveValue('Garage');
  await expect(page.getByText('Shed')).toBeVisible();
});

test('exports DXF and opens it again as a new sketch', async ({ page, isMobile }) => {
  test.skip(isMobile, 'file round trip covered on desktop');
  await fresh(page, '/piles/design');
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('menuitem', { name: 'Export as' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /AutoCAD DXF/ }).click()]);
  const path = await download.path();
  // DXF keeps geometry only — the app says what was dropped
  await expect(page.getByText(/constraint/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'plan.dxf', mimeType: 'image/vnd.dxf', buffer: readFileSync(path) });
  await expect(page.getByText('Piles (6)')).toBeVisible();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('menuitem', { name: 'Sketches…' }).click();
  await expect(page.getByLabel('This sketch')).toHaveValue('plan');
});

test('speaks Russian: menus, plurals and numbers', async ({ page }) => {
  await fresh(page, '/piles/fieldwork');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: 'Русский' }).click();
  await expect(page.getByRole('link', { name: 'Разбивка' })).toBeVisible();
  await expect(page.getByText('Следующий замер')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('button', { name: 'Демо-ошибки' }).click();
  // Russian number format: space grouping, decimal comma
  await expect(page.getByText(/^[+−]\d+,\d$/).first()).toBeVisible(); // Δ with a decimal comma
  // remembered on this device
  await page.reload();
  await expect(page.getByRole('link', { name: 'Проект' })).toBeVisible();
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
