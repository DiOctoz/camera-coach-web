// Phần logic thuần, không đụng tới trình duyệt, nên test được trực tiếp.

export const SUBJECTS = ['Chân dung', 'Ảnh nhóm', 'Phong cảnh', 'Món ăn / đồ vật', 'Kiến trúc'] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface GuidanceResult {
  instruction: string;
  ready: boolean;
}

/** Độ nghiêng của máy đang cầm dọc, tính bằng độ. */
export interface Tilt {
  /** Dương = đầu máy nghiêng sang phải (xoay theo chiều kim đồng hồ), âm = sang trái. */
  roll: number;
  /** Dương = camera chĩa lên trời, âm = chĩa xuống đất. */
  cameraTilt: number;
}

export const SYSTEM_PROMPT = `Bạn là trợ lý chụp ảnh, nói trực tiếp vào tai nghe của người đang cầm điện thoại dọc để ngắm chụp.
Mỗi lượt bạn nhận một khung hình xem trước và dữ liệu cảm biến nghiêng của máy.
Hãy đưa ra ĐÚNG MỘT chỉ dẫn quan trọng nhất để góc chụp đẹp hơn, tối đa 12 từ, tiếng Việt tự nhiên, ngắn gọn như nói miệng.
Ví dụ: "Xoay máy sang trái một chút", "Lùi lại một bước", "Hạ máy xuống ngang tầm mắt", "Dịch máy sang phải để chủ thể nằm ở đường 1/3".
Trái/phải luôn tính theo người cầm máy đang nhìn màn hình.
Dùng dữ liệu cảm biến để biết độ nghiêng thật: nếu đầu máy nghiêng sang phải thì bảo xoay máy sang trái, và ngược lại.
Thứ tự ưu tiên: 1) máy bị nghiêng (trừ khi chủ đề cần chụp từ trên xuống), 2) chủ thể bị cắt hoặc quá lệch, 3) khoảng cách gần/xa, 4) độ cao và hướng máy, 5) ngược sáng hoặc thiếu sáng, 6) bố cục và hậu cảnh rối.
Nếu người dùng đã làm theo chỉ dẫn trước, chuyển sang vấn đề tiếp theo; đừng lặp lại nguyên văn.
Nếu khung hình đã tốt, trả ready=true và instruction="Ổn rồi, chụp đi!".
Chỉ trả về JSON, không giải thích: {"instruction": "...", "ready": true hoặc false}`;

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Đổi góc beta/gamma của sự kiện `deviceorientation` thành độ nghiêng khi cầm máy dọc.
 * Tính hướng trọng lực trong hệ toạ độ của máy (x: sang phải, y: lên trên, z: ra khỏi màn hình),
 * nên cho kết quả giống nhau trên Android và iOS.
 */
export function tiltFromOrientation(betaDeg: number, gammaDeg: number): Tilt {
  const b = toRad(betaDeg);
  const g = toRad(gammaDeg);
  const gx = Math.sin(g) * Math.cos(b);
  const gy = -Math.sin(b);
  const gz = -Math.cos(g) * Math.cos(b);
  return {
    roll: toDeg(Math.atan2(gx, -gy)),
    cameraTilt: toDeg(Math.atan2(gz, -gy)),
  };
}

export function tiltDescription(tilt: Tilt | null): string {
  if (!tilt) return 'không có dữ liệu cảm biến, chỉ dựa vào hình ảnh';
  const rollText =
    Math.abs(tilt.roll) < 2
      ? 'máy đang thẳng, không nghiêng'
      : `đầu máy nghiêng sang ${tilt.roll > 0 ? 'phải' : 'trái'} ${Math.round(Math.abs(tilt.roll))}°`;
  const tiltText =
    Math.abs(tilt.cameraTilt) < 5
      ? 'camera chĩa ngang'
      : `camera chĩa ${tilt.cameraTilt > 0 ? 'lên' : 'xuống'} ${Math.round(Math.abs(tilt.cameraTilt))}°`;
  return `${rollText}; ${tiltText}`;
}

export function userContext(subject: Subject, tilt: Tilt | null, previousInstruction?: string | null): string {
  const lines = [`Chủ đề muốn chụp: ${subject}.`, `Cảm biến: ${tiltDescription(tilt)}.`];
  if (previousInstruction) lines.push(`Chỉ dẫn bạn vừa nói: "${previousInstruction}".`);
  return lines.join('\n');
}

/**
 * Đọc JSON từ câu trả lời; chấp nhận cả khi bị bọc trong ```json ... ``` hoặc có chữ thừa.
 * Nếu không có JSON hợp lệ, dùng luôn văn bản làm chỉ dẫn.
 */
export function parseGuidance(raw: string): GuidanceResult | null {
  const text = raw.trim();
  if (!text) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && typeof (parsed as GuidanceResult).instruction === 'string') {
        const instruction = (parsed as GuidanceResult).instruction.trim();
        return instruction ? { instruction, ready: (parsed as GuidanceResult).ready === true } : null;
      }
    } catch {
      // Không phải JSON hợp lệ: rơi xuống nhánh văn bản thường bên dưới.
    }
  }

  const plain = text.replaceAll('```', '').trim();
  return plain ? { instruction: plain, ready: false } : null;
}
