export function newSessionId(now: number = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `s_${now.toString(36)}_${random}`;
}
