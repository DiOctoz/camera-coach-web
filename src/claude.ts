import { parseGuidance, type GuidanceResult } from './prompting';

export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ClaudeError';
  }
}

export interface GuidanceRequest {
  apiKey: string;
  model: string;
  jpegBase64: string;
  system: string;
  userText: string;
  signal?: AbortSignal;
}

/** Gửi một khung hình cho Claude và nhận lại một chỉ dẫn. */
export async function requestGuidance(req: GuidanceRequest): Promise<GuidanceResult> {
  const response = await fetch(MESSAGES_URL, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
      // Cho phép gọi API thẳng từ trình duyệt. Chỉ phù hợp khi người dùng tự nhập key của mình.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 120,
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.jpegBase64 } },
            { type: 'text', text: req.userText },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new ClaudeError(messageForStatus(response.status), response.status);

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).map((block) => block.text ?? '').join('\n');
  const result = parseGuidance(text);
  if (!result) throw new ClaudeError('AI không trả về chỉ dẫn.');
  return result;
}

export function messageForStatus(status: number): string {
  if (status === 401) return 'API key không hợp lệ.';
  if (status === 403) return 'API key không có quyền dùng model này.';
  if (status === 429) return 'Gọi AI quá nhanh hoặc hết hạn mức. Thử tăng thời gian nghỉ trong Cài đặt.';
  if (status >= 500) return `Máy chủ AI đang lỗi (${status}).`;
  return `Lỗi gọi AI (${status}).`;
}
