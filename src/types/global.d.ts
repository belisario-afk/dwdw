// Optional global typings to make TS happy when referencing window.__director etc.
import type { VisualDirector } from '../controllers/director';

declare global {
  interface Window {
    __director?: VisualDirector;
    __emitSongRequest?: (p: any) => void;
    __IMG_PROXY_BASE?: string;
    __songReqHooked?: boolean;
  }
}
export {};