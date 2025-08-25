declare namespace Spotify {
  type PlaybackState = any;
  class Player {
    constructor(opts: { name: string; volume?: number; getOAuthToken: (cb: (token: string) => void) => void; });
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(name: string, cb: (data: any) => void): void;
    removeListener(name: string): void;
    getCurrentState(): Promise<PlaybackState | null>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    setVolume(v: number): Promise<void>;
  }
}