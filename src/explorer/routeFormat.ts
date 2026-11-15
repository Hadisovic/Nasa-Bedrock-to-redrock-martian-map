export function formatRouteDuration(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds}\u00a0s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}\u00a0min ${seconds % 60}\u00a0s`;
  return `${Math.floor(seconds / 3600)}\u00a0h ${Math.floor(seconds % 3600 / 60)}\u00a0min`;
}
