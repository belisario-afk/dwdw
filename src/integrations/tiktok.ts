type CommandHandler = (user: string, text: string) => void;

declare global {
  interface Window {
    TikTokLiveConnector?: any;
    WebcastPushConnection?: any;
  }
}

export class TikTokChatBridge {
  private connection: any | null = null;
  private onCmd?: CommandHandler;

  onCommand(cb: CommandHandler) {
    this.onCmd = cb;
  }

  async connect(username: string): Promise<void> {
    if (this.connection) await this.disconnect();

    // Try to ensure the browser build is available
    if (!this.hasConnector()) {
      await this.loadConnector();
    }
    if (!this.hasConnector()) {
      throw new Error('TikTok connector library not available.');
    }

    const Ctor =
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection;

    const conn = new Ctor(username, { enableExtendedGiftInfo: false });
    this.connection = conn;

    conn.on('chat', (data: any) => {
      const user = data?.uniqueId || data?.nickname || 'user';
      const text: string = data?.comment || '';
      if (!text) return;
      if (text.trim().toLowerCase().startsWith('!play')) {
        this.onCmd?.(user, text);
      }
    });

    // Errors should not crash the app
    conn.on('error', (e: any) => {
      console.debug('TikTok connection error:', e?.message || e);
    });

    await conn.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connection?.disconnect) {
      try { await this.connection.disconnect(); } catch {}
    }
    this.connection = null;
  }

  private hasConnector(): boolean {
    return !!(
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection
    );
  }

  private loadConnector(): Promise<void> {
    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-tiktok-connector]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/tiktok-live-connector/dist/browser.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-tiktok-connector', '1');
      s.onload = () => resolve();
      s.onerror = () => resolve(); // resolve anyway; we'll throw later if missing
      document.head.appendChild(s);
    });
  }
}