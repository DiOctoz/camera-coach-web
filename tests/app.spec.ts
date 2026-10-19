// Test end-to-end: camera giả của Chromium, API Claude bị mock, giọng đọc bị thay bằng bản ghi.
import { expect, test, type Page, type Route } from '@playwright/test';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

declare global {
  interface Window {
    __spoken: string[];
  }
}

/** Thay speechSynthesis bằng bản giả ghi lại mọi câu được đọc, và nạp sẵn cài đặt. */
async function prepare(page: Page, settings: Record<string, unknown> = { apiKey: 'test-key', pauseSeconds: 0.5 }) {
  await page.addInitScript((saved) => {
    window.__spoken = [];
    const fake = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices: () => [],
      cancel() {},
      pause() {},
      resume() {},
      speak(utterance: SpeechSynthesisUtterance) {
        if (utterance.text.trim()) window.__spoken.push(utterance.text);
        setTimeout(() => utterance.onend?.call(utterance, new Event('end') as SpeechSynthesisEvent), 30);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    localStorage.setItem('camera-coach-settings', JSON.stringify(saved));
  }, settings);
}

function claudeReply(text: string) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ content: [{ type: 'text', text }] }),
    });
}

async function openCamera(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-btn').click();
  await expect(page.getByTestId('viewfinder')).toBeVisible();
}

test('hiện và đọc chỉ dẫn từ AI', async ({ page }) => {
  await prepare(page);
  const requests: { headers: Record<string, string>; body: any }[] = [];
  await page.route(MESSAGES_URL, async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    await claudeReply('{"instruction": "Xoay máy sang trái một chút", "ready": false}')(route);
  });

  await openCamera(page);
  await page.getByTestId('guide-btn').click();

  await expect(page.getByTestId('instruction')).toHaveText('Xoay máy sang trái một chút');
  await expect(page.getByTestId('guide-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__spoken)).toContain('Xoay máy sang trái một chút');

  // Kiểm tra request gửi đi đúng định dạng.
  const first = requests[0];
  expect(first.headers['x-api-key']).toBe('test-key');
  expect(first.body.model).toBe('claude-haiku-5-5');
  expect(first.body.messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } });
  expect(first.body.messages[0].content[1].text).toContain('Chủ đề muốn chụp: Chân dung');
});

test('viền khung ngắm chuyển xanh khi AI báo đã ổn', async ({ page }) => {
  await prepare(page);
  await page.route(MESSAGES_URL, claudeReply('{"instruction": "Ổn rồi, chụp đi!", "ready": true}'));

  await openCamera(page);
  await page.getByTestId('guide-btn').click();

  await expect(page.getByTestId('viewfinder')).toHaveClass(/is-ready/);
});

test('tắt hướng dẫn thì dừng gọi AI', async ({ page }) => {
  await prepare(page);
  let calls = 0;
  await page.route(MESSAGES_URL, async (route) => {
    calls++;
    await claudeReply('{"instruction": "Lùi lại một bước", "ready": false}')(route);
  });

  await openCamera(page);
  await page.getByTestId('guide-btn').click();
  await expect(page.getByTestId('instruction')).toHaveText('Lùi lại một bước');
  await page.getByTestId('guide-btn').click();
  await expect(page.getByTestId('guide-btn')).toHaveAttribute('aria-pressed', 'false');

  const callsWhenStopped = calls;
  await page.waitForTimeout(1500);
  expect(calls).toBe(callsWhenStopped);
});

test('API key sai: báo lỗi và tự dừng sau 3 lần', async ({ page }) => {
  await prepare(page);
  await page.route(MESSAGES_URL, (route) =>
    route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  );

  await openCamera(page);
  await page.getByTestId('guide-btn').click();

  await expect(page.getByTestId('error')).toHaveText('API key không hợp lệ.');
  await expect(page.getByTestId('guide-btn')).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.__spoken.join(' | '))).toContain('Mất kết nối');
});

test('chưa có API key thì mở cài đặt và nhắc nhập', async ({ page }) => {
  await prepare(page, {});
  await openCamera(page);

  const dialog = page.getByTestId('settings-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('settings-save').click();
  await page.getByTestId('guide-btn').click();
  await expect(page.getByTestId('error')).toContainText('Chưa có API key');

  await page.getByTestId('settings-btn').click();
  await page.getByTestId('api-key').fill('sk-ant-moi');
  await page.getByTestId('settings-save').click();
  await expect(dialog).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('camera-coach-settings') ?? '{}'));
  expect(saved.apiKey).toBe('sk-ant-moi');
});

test('đường thăng bằng xoay theo cảm biến', async ({ page }) => {
  await prepare(page);
  await openCamera(page);

  const level = page.getByTestId('level');
  await page.evaluate(() =>
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 80, gamma: 30 })),
  );
  await expect(level).toBeVisible();
  await expect(level).toHaveAttribute('data-roll', '5');
  await expect(level).not.toHaveClass(/is-level/);

  await page.evaluate(() =>
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 })),
  );
  await expect(level).toHaveClass(/is-level/);
});

test('chụp ảnh hiện ảnh thu nhỏ', async ({ page }) => {
  await prepare(page);
  await openCamera(page);

  await page.getByTestId('shutter-btn').click();
  await expect(page.getByTestId('thumb')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('Đã chụp');
});
