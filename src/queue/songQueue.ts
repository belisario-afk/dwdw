import { SpotifyAPI } from '@spotify/api';
import { PlayerController } from '@spotify/player';

export type QueueItem = {
  uri: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  requestedBy?: string;
};

type UpdateListener = (items: QueueItem[]) => void;

export class SongQueueManager {
  private items: QueueItem[] = [];
  private listeners: UpdateListener[] = [];

  constructor(private api: SpotifyAPI, private player: PlayerController) {}

  onUpdate(cb: UpdateListener) {
    this.listeners.push(cb);
  }
  private emit() {
    for (const cb of this.listeners) cb(this.items.slice());
  }

  async addByQuery(query: string, requestedBy?: string): Promise<QueueItem | null> {
    const deviceId = await this.player.ensureActiveDevice().catch(() => null);

    const res = await this.api.searchTracks(query, 5);
    const track = res?.tracks?.items?.[0];
    if (!track) return null;

    const item: QueueItem = {
      uri: track.uri,
      title: track.name,
      artist: (track.artists || []).map((a: any) => a.name).join(', '),
      albumArtUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url,
      requestedBy
    };

    // Optimistically add to our UI queue first
    this.items.push(item);
    this.emit();

    try {
      await this.api.addToQueue(item.uri, deviceId ?? undefined);
    } catch (e) {
      // Roll back on failure
      this.items = this.items.filter((i) => i.uri !== item.uri || i.requestedBy !== item.requestedBy);
      this.emit();
      throw e;
    }

    return item;
  }
}