/** Simulation rate. Rendering may drop frames; physics does not change dt. */
export const SIM_HZ = 60

/** Target frame time on an ordinary laptop. */
export const FRAME_BUDGET_MS = 1000 / 60

/**
 * Headless/browser perf checks fail only when the loop is clearly under budget.
 * 33 ms is 30 fps: half the target, not a one-frame hitch.
 */
export const PERF_FAIL_FRAME_MS = 33

/** Average physics time inside a frame. The render budget keeps the rest. */
export const PERF_FAIL_SIM_MS = 6
