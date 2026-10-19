/** Đọc chỉ dẫn bằng giọng tiếng Việt qua loa hoặc tai nghe đang kết nối (Web Speech API). */
export class Speech {
  private voice: SpeechSynthesisVoice | null = null;

  constructor(private readonly lang = 'vi-VN') {
    if (!this.supported) return;
    this.pickVoice();
    window.speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  get supported(): boolean {
    return 'speechSynthesis' in window;
  }

  get hasVietnameseVoice(): boolean {
    return this.voice !== null;
  }

  private pickVoice(): void {
    const voices = window.speechSynthesis.getVoices();
    this.voice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi')) ?? null;
  }

  /** iOS chỉ cho phát giọng đọc sau khi lần đầu được gọi từ một thao tác chạm. */
  unlock(): void {
    if (!this.supported) return;
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }

  /** Nói và chờ đến khi nói xong. Có hạn chờ phòng khi trình duyệt không bắn sự kiện `end`. */
  speak(text: string): Promise<void> {
    if (!this.supported) return Promise.resolve();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.05;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 4000 + text.length * 120);
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }
}
