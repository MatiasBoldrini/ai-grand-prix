export function formatRaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  const whole = Math.floor(rest)
  const millis = Math.round((rest - whole) * 1000)
  const carry = millis === 1000 ? 1 : 0
  const shownMillis = millis === 1000 ? 0 : millis
  const shownWhole = whole + carry
  return `${minutes}:${String(shownWhole).padStart(2, '0')}.${String(shownMillis).padStart(3, '0')}`
}

export function formatSpeed(metersPerSecond: number): string {
  return String(Math.max(0, Math.round(metersPerSecond * 3.6)))
}
