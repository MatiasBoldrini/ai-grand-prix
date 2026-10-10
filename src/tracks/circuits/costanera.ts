import type { TrackDefinition } from '../types.ts'

/**
 * Circuito de la Costanera. A waterfront loop: a long rambla, a park chicane
 * that the straight chord can cut, a fast lighthouse sweeper, a flat avenue and a
 * port hairpin with a long braking easement. Corner data is the source of
 * truth; the spline is derived.
 *
 * The chicane stays inside the wall (half width plus runoff is 20 m) so the
 * cut is drivable rather than a collision.
 */
export const track: TrackDefinition = {
  id: 'costanera',
  name: 'Circuito de la Costanera',
  description:
    'La rambla es ancha y el corte del parque saltea la chicana. La curva del faro es rápida y la del puerto se cierra.',
  laps: 3,
  width: 18,
  runoff: 11,
  gates: 8,
  sampleSpacing: 1,
  shortcuts: [
    {
      id: 'corte-del-parque',
      name: 'Corte del parque',
      fromCorner: 2,
      toCorner: 10,
      halfWidth: 5,
    },
  ],
  corners: [
    { x: 132, z: 26 },
    { x: 164, z: 26 },
    { x: 196, z: 26 },
    { x: 210, z: 23.95 },
    { x: 224, z: 19 },
    { x: 238, z: 14.05 },
    { x: 252, z: 12 },
    { x: 266, z: 14.05 },
    { x: 280, z: 19 },
    { x: 294, z: 23.95 },
    { x: 308, z: 26 },
    { x: 329.43, z: 30.26 },
    { x: 347.6, z: 42.4 },
    { x: 359.74, z: 60.57 },
    { x: 364, z: 82 },
    { x: 359.74, z: 103.43 },
    { x: 347.6, z: 121.6 },
    { x: 329.43, z: 133.74 },
    { x: 308, z: 138 },
    { x: 283, z: 138 },
    { x: 258, z: 138 },
    { x: 233, z: 138 },
    { x: 208, z: 138 },
    { x: 183, z: 138 },
    { x: 158, z: 138 },
    { x: 133, z: 138 },
    { x: 108, z: 138 },
    { x: 94.01, z: 137.62 },
    { x: 80.09, z: 136.12 },
    { x: 66.5, z: 132.76 },
    { x: 53.77, z: 126.91 },
    { x: 42.83, z: 118.19 },
    { x: 35.59, z: 108.62 },
    { x: 30.73, z: 97.64 },
    { x: 28.51, z: 85.85 },
    { x: 29.04, z: 73.86 },
    { x: 32.3, z: 62.32 },
    { x: 38.12, z: 51.82 },
    { x: 46.19, z: 42.93 },
    { x: 56.07, z: 36.13 },
    { x: 67.25, z: 31.76 },
    { x: 83.06, z: 29.3 },
    { x: 99.06, z: 29.29 },
    { x: 115.03, z: 30.1 },
    { x: 123.52, z: 28.05 },
  ],
}
