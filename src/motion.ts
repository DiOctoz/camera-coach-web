import { tiltFromOrientation, type Tilt } from './prompting';

type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Đọc độ nghiêng của máy qua sự kiện deviceorientation. */
export class Motion {
  tilt: Tilt | null = null;
  onChange?: (tilt: Tilt) => void;
  private listening = false;

  private readonly handle = (event: DeviceOrientationEvent) => {
    if (event.beta == null || event.gamma == null) return;
    this.tilt = tiltFromOrientation(event.beta, event.gamma);
    this.onChange?.(this.tilt);
  };

  /**
   * Phải gọi ngay trong sự kiện chạm/bấm của người dùng: iOS Safari chỉ hiện hộp xin quyền
   * cảm biến khi được gọi từ một thao tác của người dùng.
   */
  async start(): Promise<boolean> {
    if (this.listening) return true;
    if (typeof DeviceOrientationEvent === 'undefined') return false;

    const ctor = DeviceOrientationEvent as unknown as OrientationPermission;
    if (typeof ctor.requestPermission === 'function') {
      try {
        if ((await ctor.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this.handle);
    this.listening = true;
    return true;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.handle);
    this.listening = false;
  }
}
