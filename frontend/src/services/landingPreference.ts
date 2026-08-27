export const LANDING_SEEN_STORAGE_KEY = 'tracemind.landing.seen.v1'

export function hasSeenLanding(): boolean {
  try {
    return window.localStorage.getItem(LANDING_SEEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function markLandingSeen(): void {
  try {
    window.localStorage.setItem(LANDING_SEEN_STORAGE_KEY, 'true')
  } catch {
    // Storage availability must never block entry into the local workspace.
  }
}
