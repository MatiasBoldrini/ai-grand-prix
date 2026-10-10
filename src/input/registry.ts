import type { InputDevice, PolledInput } from './types.ts'

interface DeviceModule {
  device: InputDevice
}

const modules = import.meta.glob<DeviceModule>('./devices/*.ts', { eager: true })

export function listDevices(): InputDevice[] {
  return Object.values(modules)
    .map((mod) => mod.device)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

export function pollInput(): PolledInput {
  const samples = listDevices().map((device) => ({ device, sample: device.poll() }))
  const driving = samples
    .filter((item) => item.sample.active)
    .sort((a, b) => b.device.priority - a.device.priority)
  const top = driving[0]?.sample
  return {
    vehicle: {
      throttle: top?.throttle ?? 0,
      brake: top?.brake ?? 0,
      steer: top?.steer ?? 0,
    },
    pauseEdge: samples.some((item) => item.sample.pauseEdge),
    fpsEdge: samples.some((item) => item.sample.fpsEdge),
    respawnEdge: samples.some((item) => item.sample.respawnEdge),
  }
}

export function mountDevices(parent: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  for (const device of listDevices()) {
    device.mount?.(parent)
    cleanups.push(() => device.unmount?.())
  }
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
