let ignoreUntil = 0

/** Ignore the Escape key that the browser also uses to drop pointer lock. */
export function suppressEscapePause(ms = 400): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  ignoreUntil = now + ms
}

export function escapePauseSuppressed(): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return now < ignoreUntil
}
