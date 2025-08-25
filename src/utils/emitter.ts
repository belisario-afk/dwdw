export class Emitter<T extends Record<string, (...args: any[]) => any>> {
  private map = new Map<keyof T, Set<Function>>();
  on<K extends keyof T>(type: K, fn: T[K]) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn as any);
  }
  off<K extends keyof T>(type: K, fn: T[K]) {
    this.map.get(type)?.delete(fn as any);
  }
  emit<K extends keyof T>(type: K, ...args: Parameters<T[K]>) {
    this.map.get(type)?.forEach(fn => (fn as any)(...args));
  }
}