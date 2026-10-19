import './style.css';
import { Camera } from './camera';
import { GuidanceEngine, type EngineState } from './guidance';
import { Motion } from './motion';
import { SUBJECTS, type Subject, type Tilt } from './prompting';
import { loadSettings, MODELS, saveSettings } from './settings';
import { Speech } from './speech';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Thiếu phần tử #${id} trong index.html`);
  return el as T;
}

const els = {
  startScreen: $('start-screen'),
  startBtn: $<HTMLButtonElement>('start-btn'),
  startError: $('start-error'),
  app: $('app'),
  video: $<HTMLVideoElement>('preview'),
  viewfinder: $('viewfinder'),
  level: $('level'),
  flash: $('flash'),
  subject: $<HTMLSelectElement>('subject'),
  settingsBtn: $<HTMLButtonElement>('settings-btn'),
  card: $('instruction-card'),
  instruction: $('instruction-text'),
  error: $('error-text'),
  voiceWarning: $('voice-warning'),
  guideBtn: $<HTMLButtonElement>('guide-btn'),
  guideLabel: $('guide-label'),
  shutter: $<HTMLButtonElement>('shutter-btn'),
  thumb: $<HTMLButtonElement>('thumb'),
  thumbImg: $<HTMLImageElement>('thumb-img'),
  dialog: $<HTMLDialogElement>('settings-dialog'),
  form: $<HTMLFormElement>('settings-form'),
  apiKey: $<HTMLInputElement>('api-key'),
  model: $<HTMLSelectElement>('model'),
  pause: $<HTMLInputElement>('pause'),
  pauseValue: $('pause-value'),
  cancel: $<HTMLButtonElement>('settings-cancel'),
  toast: $('toast'),
};

const settings = loadSettings();
const camera = new Camera(els.video);
const motion = new Motion();
const speech = new Speech();
const engine = new GuidanceEngine(camera, motion, speech, settings);

// ---------- Hiển thị ----------

function renderEngine(s: EngineState): void {
  els.instruction.textContent = s.instruction;
  els.error.textContent = s.error ?? '';
  els.error.hidden = !s.error;
  els.card.dataset.state = !s.running ? 'off' : s.thinking ? 'thinking' : s.ready ? 'ready' : 'on';
  els.viewfinder.classList.toggle('is-ready', s.running && s.ready);
  els.guideBtn.setAttribute('aria-pressed', String(s.running));
  els.guideLabel.textContent = s.running ? 'Đang hướng dẫn' : 'Bật AI';
}

function renderTilt(tilt: Tilt): void {
  const roll = Math.round(tilt.roll * 10) / 10;
  els.level.hidden = false;
  els.level.style.setProperty('--roll', `${-roll}deg`);
  els.level.dataset.roll = String(Math.round(roll));
  els.level.classList.toggle('is-level', Math.abs(roll) < 2);
}

function fitViewfinder(): void {
  const { videoWidth: w, videoHeight: h } = els.video;
  if (!w || !h) return;
  els.viewfinder.style.setProperty('--ar', `${w} / ${h}`);
  els.viewfinder.style.setProperty('--arn', String(w / h));
}

let toastTimer: number | undefined;
function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (els.toast.hidden = true), 2200);
}

engine.onState = renderEngine;
motion.onChange = renderTilt;
els.video.addEventListener('loadedmetadata', fitViewfinder);
els.video.addEventListener('resize', fitViewfinder);
renderEngine(engine.state);

// ---------- Chủ đề ----------

for (const subject of SUBJECTS) els.subject.add(new Option(subject, subject));
els.subject.value = settings.subject;
els.subject.addEventListener('change', () => {
  settings.subject = els.subject.value as Subject;
  saveSettings(settings);
});

// ---------- Bật camera ----------

let started = false;

els.startBtn.addEventListener('click', async () => {
  els.startBtn.disabled = true;
  els.startError.hidden = true;

  // Hai lệnh này phải chạy ngay trong lần chạm (yêu cầu của iOS Safari).
  speech.unlock();
  const motionPromise = motion.start();

  try {
    await camera.start();
  } catch (err) {
    els.startError.textContent = err instanceof Error ? err.message : String(err);
    els.startError.hidden = false;
    els.startBtn.disabled = false;
    return;
  }

  started = true;
  els.startScreen.hidden = true;
  els.app.hidden = false;
  fitViewfinder();

  if (!(await motionPromise)) toast('Không đọc được cảm biến nghiêng. AI sẽ chỉ dựa vào hình ảnh.');
  if (!speech.supported) {
    toast('Trình duyệt này không có giọng đọc. Chỉ dẫn chỉ hiện trên màn hình.');
  } else {
    window.setTimeout(() => (els.voiceWarning.hidden = speech.hasVietnameseVoice), 1500);
  }
  if (!settings.apiKey) openSettings();
});

// Tắt camera và AI khi chuyển ứng dụng hoặc khoá màn hình, bật lại camera khi quay về.
document.addEventListener('visibilitychange', () => {
  if (!started) return;
  if (document.hidden) {
    engine.stop();
    camera.stop();
  } else {
    camera.start().catch((err: Error) => toast(err.message));
  }
});

// ---------- Hướng dẫn và chụp ----------

els.guideBtn.addEventListener('click', () => engine.toggle());

let lastPhoto: { blob: Blob; url: string } | null = null;

els.shutter.addEventListener('click', async () => {
  els.flash.classList.remove('is-on');
  void els.flash.offsetWidth; // khởi động lại hiệu ứng nháy
  els.flash.classList.add('is-on');
  navigator.vibrate?.(30);

  const blob = await camera.capturePhoto();
  if (!blob) {
    toast('Chụp không thành công.');
    return;
  }
  if (lastPhoto) URL.revokeObjectURL(lastPhoto.url);
  lastPhoto = { blob, url: URL.createObjectURL(blob) };
  els.thumbImg.src = lastPhoto.url;
  els.thumb.hidden = false;
  toast('Đã chụp. Chạm ảnh nhỏ để lưu.');
  if (engine.state.running) void speech.speak('Đã chụp.');
});

els.thumb.addEventListener('click', async () => {
  if (!lastPhoto) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = new File([lastPhoto.blob], `camera-coach-${stamp}.jpg`, { type: 'image/jpeg' });

  // Điện thoại: mở bảng chia sẻ để lưu vào thư viện ảnh. Máy tính: tải file về.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  const link = document.createElement('a');
  link.href = lastPhoto.url;
  link.download = file.name;
  link.click();
});

// ---------- Cài đặt ----------

for (const m of MODELS) els.model.add(new Option(m.label, m.id));

const formatPause = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1 });

function openSettings(): void {
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  els.pause.value = String(settings.pauseSeconds);
  els.pauseValue.textContent = formatPause(settings.pauseSeconds);
  els.dialog.showModal();
}

els.settingsBtn.addEventListener('click', openSettings);
els.cancel.addEventListener('click', () => els.dialog.close());
els.pause.addEventListener('input', () => (els.pauseValue.textContent = formatPause(Number(els.pause.value))));

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  settings.apiKey = els.apiKey.value.trim();
  settings.model = els.model.value;
  settings.pauseSeconds = Number(els.pause.value);
  saveSettings(settings);
  els.dialog.close();
  toast('Đã lưu cài đặt.');
  if (engine.state.error && settings.apiKey) renderEngine({ ...engine.state, error: null });
});
