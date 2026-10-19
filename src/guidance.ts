import type { Camera } from './camera';
import { ClaudeError, requestGuidance } from './claude';
import type { Motion } from './motion';
import { SYSTEM_PROMPT, userContext } from './prompting';
import type { Settings } from './settings';
import type { Speech } from './speech';

export interface EngineState {
  running: boolean;
  thinking: boolean;
  ready: boolean;
  instruction: string;
  error: string | null;
}

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_FAILURES = 3;
const REPEAT_AFTER_MS = 6_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Vòng lặp: lấy khung hình → hỏi Claude → đọc chỉ dẫn → nghỉ một chút → lặp lại. */
export class GuidanceEngine {
  state: EngineState = {
    running: false,
    thinking: false,
    ready: false,
    instruction: 'Bật AI để nghe hướng dẫn chỉnh góc máy.',
    error: null,
  };
  onState?: (state: EngineState) => void;

  private runId = 0;
  private controller: AbortController | null = null;
  private lastSpoken: { text: string; at: number } | null = null;

  constructor(
    private readonly camera: Camera,
    private readonly motion: Motion,
    private readonly speech: Speech,
    private readonly settings: Settings,
  ) {}

  toggle(): void {
    if (this.state.running) this.stop();
    else this.start();
  }

  start(): void {
    if (this.state.running) return;
    if (!this.settings.apiKey.trim()) {
      this.update({ error: 'Chưa có API key. Bấm nút bánh răng để nhập.' });
      return;
    }
    this.lastSpoken = null;
    this.update({ running: true, error: null, ready: false });
    void this.loop(++this.runId);
  }

  stop(): void {
    this.runId++;
    this.controller?.abort();
    this.controller = null;
    this.speech.stop();
    this.update({ running: false, thinking: false, ready: false });
  }

  private update(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  private isCurrent(id: number): boolean {
    return id === this.runId;
  }

  private async loop(id: number): Promise<void> {
    await this.speech.speak('Bắt đầu hướng dẫn.');
    let failures = 0;

    while (this.isCurrent(id)) {
      const jpegBase64 = this.camera.snapshotBase64();
      if (!jpegBase64) {
        await sleep(300);
        continue;
      }

      const controller = new AbortController();
      this.controller = controller;
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      this.update({ thinking: true });

      try {
        const result = await requestGuidance({
          apiKey: this.settings.apiKey.trim(),
          model: this.settings.model,
          jpegBase64,
          system: SYSTEM_PROMPT,
          userText: userContext(this.settings.subject, this.motion.tilt, this.lastSpoken?.text),
          signal: controller.signal,
        });
        if (!this.isCurrent(id)) break;
        failures = 0;
        this.update({ thinking: false, error: null, instruction: result.instruction, ready: result.ready });
        if (this.shouldSpeak(result.instruction)) {
          this.lastSpoken = { text: result.instruction, at: Date.now() };
          await this.speech.speak(result.instruction);
        }
      } catch (err) {
        if (!this.isCurrent(id)) break;
        failures++;
        this.update({ thinking: false, error: describeError(err) });
        if (failures >= MAX_FAILURES) {
          await this.speech.speak('Mất kết nối với AI, đã tạm dừng hướng dẫn.');
          if (this.isCurrent(id)) this.stop();
          break;
        }
      } finally {
        clearTimeout(timer);
      }

      await sleep(this.settings.pauseSeconds * 1000);
    }
  }

  /** Không nhắc lại cùng một câu liên tục; chỉ nhắc lại sau 6 giây. */
  private shouldSpeak(text: string): boolean {
    const last = this.lastSpoken;
    return !last || last.text !== text || Date.now() - last.at > REPEAT_AFTER_MS;
  }
}

function describeError(err: unknown): string {
  if (err instanceof ClaudeError) return err.message;
  if (err instanceof DOMException && err.name === 'AbortError') return 'AI phản hồi quá lâu, đang thử lại.';
  if (err instanceof TypeError) return 'Không kết nối được tới AI. Kiểm tra mạng.';
  return err instanceof Error ? err.message : 'Lỗi không xác định.';
}
