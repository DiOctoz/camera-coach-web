import { SUBJECTS, type Subject } from './prompting';

export const STORAGE_KEY = 'camera-coach-settings';

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5: nhanh, rẻ (khuyên dùng)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5: góp ý kỹ hơn, chậm hơn' },
] as const;

export interface Settings {
  apiKey: string;
  model: string;
  subject: Subject;
  /** Thời gian nghỉ giữa hai lần hỏi AI (giây). */
  pauseSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: MODELS[0].id,
  subject: 'Chân dung',
  pauseSeconds: 1,
};

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : DEFAULT_SETTINGS.apiKey,
      model: MODELS.some((m) => m.id === saved.model) ? saved.model! : DEFAULT_SETTINGS.model,
      subject: SUBJECTS.includes(saved.subject as Subject) ? (saved.subject as Subject) : DEFAULT_SETTINGS.subject,
      pauseSeconds:
        typeof saved.pauseSeconds === 'number' && saved.pauseSeconds >= 0.5 && saved.pauseSeconds <= 5
          ? saved.pauseSeconds
          : DEFAULT_SETTINGS.pauseSeconds,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Trình duyệt chặn bộ nhớ (chế độ ẩn danh...): cài đặt chỉ giữ trong phiên này.
  }
}
