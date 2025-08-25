export async function backoff<T>(fn: () => Promise<T>, max = 5): Promise<T> {
  let attempt = 0;
  let delay = 300;
  while (true) {
    try { return await fn(); }
    catch (e: any) {
      attempt++;
      if (attempt >= max) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(3000, delay * 2);
    }
  }
}