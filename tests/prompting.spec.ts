// Test logic thuần: không cần mở trình duyệt, Playwright chạy thẳng bằng Node.
import { expect, test } from '@playwright/test';
import { parseGuidance, tiltDescription, tiltFromOrientation, userContext } from '../src/prompting';

test.describe('parseGuidance', () => {
  test('đọc JSON thường', () => {
    expect(parseGuidance('{"instruction": "Lùi lại một bước", "ready": false}')).toEqual({
      instruction: 'Lùi lại một bước',
      ready: false,
    });
  });

  test('đọc JSON bị bọc trong code fence', () => {
    const raw = '```json\n{"instruction": "Ổn rồi, chụp đi!", "ready": true}\n```';
    expect(parseGuidance(raw)).toEqual({ instruction: 'Ổn rồi, chụp đi!', ready: true });
  });

  test('dùng văn bản thường khi không có JSON', () => {
    expect(parseGuidance('  Hạ máy xuống một chút \n')).toEqual({
      instruction: 'Hạ máy xuống một chút',
      ready: false,
    });
  });

  test('trả về null khi câu trả lời rỗng', () => {
    expect(parseGuidance('   ')).toBeNull();
    expect(parseGuidance('{"instruction": "  ", "ready": false}')).toBeNull();
  });
});

test.describe('độ nghiêng', () => {
  test('máy cầm dọc thẳng đứng thì không nghiêng', () => {
    const tilt = tiltFromOrientation(90, 0);
    expect(tilt.roll).toBeCloseTo(0, 5);
    expect(tilt.cameraTilt).toBeCloseTo(0, 5);
  });

  test('gamma dương nghĩa là đầu máy nghiêng sang phải', () => {
    expect(tiltFromOrientation(80, 30).roll).toBeGreaterThan(0);
    expect(tiltFromOrientation(80, -30).roll).toBeLessThan(0);
  });

  test('beta nhỏ hơn 90 nghĩa là camera chĩa xuống', () => {
    expect(tiltFromOrientation(60, 0).cameraTilt).toBeCloseTo(-30, 5);
  });

  test('mô tả bằng tiếng Việt', () => {
    expect(tiltDescription({ roll: 1.2, cameraTilt: -3 })).toBe('máy đang thẳng, không nghiêng; camera chĩa ngang');
    expect(tiltDescription({ roll: 7.4, cameraTilt: -12.6 })).toBe('đầu máy nghiêng sang phải 7°; camera chĩa xuống 13°');
    expect(tiltDescription({ roll: -5, cameraTilt: 20 })).toBe('đầu máy nghiêng sang trái 5°; camera chĩa lên 20°');
    expect(tiltDescription(null)).toContain('không có dữ liệu cảm biến');
  });

  test('ngữ cảnh gửi AI có chủ đề và chỉ dẫn trước', () => {
    const text = userContext('Chân dung', null, 'Lùi lại một bước');
    expect(text).toContain('Chân dung');
    expect(text).toContain('"Lùi lại một bước"');
  });
});
