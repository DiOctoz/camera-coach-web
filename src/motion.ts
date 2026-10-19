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
    if (typeof DeviceOrientationEvent === 'undefined') return false;

    // Gắn listener trước: nếu chưa có quyền thì đơn giản là không có sự kiện nào tới.
    if (!this.listening) {
      window.addEventListener('deviceorientation', this.handle);
      this.listening = true;
    }

    const ctor = DeviceOrientationEvent as unknown as OrientationPermission;
    if (typeof ctor.requestPermission !== 'function') return true;
    try {
      return (await ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.handle);
    this.listening = false;
  }
}
