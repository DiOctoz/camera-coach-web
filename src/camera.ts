/** Camera sau của điện thoại (hoặc webcam trên máy tính): xem trước, lấy khung hình, chụp ảnh. */
export class Camera {
  private stream: MediaStream | null = null;
  private readonly canvas = document.createElement('canvas');

  constructor(readonly video: HTMLVideoElement) {}

  get isActive(): boolean {
    return this.stream !== null && this.video.videoWidth > 0;
  }

  async start(): Promise<void> {
    if (this.stream) return;
    if (!window.isSecureContext) {
      throw new Error('Camera chỉ chạy trên HTTPS hoặc localhost. Hãy mở trang bằng địa chỉ https://');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt này không hỗ trợ camera. Hãy thử Chrome hoặc Safari bản mới.');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
    } catch (err) {
      throw new Error(cameraErrorMessage(err));
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise((resolve) => this.video.addEventListener('loadedmetadata', resolve, { once: true }));
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private draw(maxDimension: number): HTMLCanvasElement | null {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!this.stream || !w || !h) return null;
    const scale = Math.min(1, maxDimension / Math.max(w, h));
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.canvas.getContext('2d')?.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas;
  }

  /** Khung hình hiện tại dạng JPEG base64, thu nhỏ để gửi AI nhanh và tốn ít token. */
  snapshotBase64(maxDimension = 768, quality = 0.6): string | null {
    const canvas = this.draw(maxDimension);
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  /** Ảnh chụp ở độ phân giải đầy đủ của luồng camera. */
  capturePhoto(quality = 0.92): Promise<Blob | null> {
    const canvas = this.draw(Number.POSITIVE_INFINITY);
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Bạn đã chặn quyền camera. Cho phép lại trong cài đặt trang của trình duyệt rồi tải lại trang.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Không tìm thấy camera trên thiết bị này.';
    case 'NotReadableError':
      return 'Camera đang bị ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.';
    default:
      return `Không mở được camera${err instanceof Error && err.message ? `: ${err.message}` : '.'}`;
  }
}
