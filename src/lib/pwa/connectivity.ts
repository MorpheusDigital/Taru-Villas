export function connectionMessage(isOnline: boolean): string | null {
  return isOnline
    ? null
    : 'You are offline. Reconnect to continue using the portal.'
}
