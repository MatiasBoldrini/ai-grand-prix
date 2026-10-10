import type { TrackDefinition } from '../types.ts'

/**
 * Autódromo de Potrerillos. A Mendoza foothill loop: long straight, a chicane
 * you can cut, two hairpins. Corner data is the source of truth; the spline is derived.
 */
export const track: TrackDefinition = {
  id: 'gradiente',
  name: 'Autódromo de Potrerillos',
  description:
    'Recta larga entre el piedemonte, una chicana que se puede cortar y dos horquillas. El pasto te saca velocidad.',
  laps: 2,
  width: 16,
  runoff: 8,
  gates: 12,
  sampleSpacing: 1,
  shortcuts: [
    {
      id: 'corte-chicana',
      name: 'Corte de la chicana',
      fromCorner: 1,
      toCorner: 5,
      halfWidth: 7,
    },
  ],
  corners: [
    { x: 54, z: 0 },
    { x: 81, z: 0 },
    { x: 108, z: -8.1 },
    { x: 135, z: -18.9 },
    { x: 162, z: -8.1 },
    { x: 189, z: 0 },
    { x: 216, z: 0 },
    { x: 243, z: 0 },
    { x: 270, z: 0 },
    { x: 294.6, z: 2.92 },
    { x: 314.33, z: 18.65 },
    { x: 325.28, z: 41.38 },
    { x: 325.28, z: 66.62 },
    { x: 314.33, z: 89.35 },
    { x: 294.6, z: 105.08 },
    { x: 270, z: 110.7 },
    { x: 243, z: 108 },
    { x: 216, z: 108 },
    { x: 189, z: 116.1 },
    { x: 162, z: 116.1 },
    { x: 135, z: 108 },
    { x: 108, z: 108 },
    { x: 81, z: 108 },
    { x: 54, z: 108 },
    { x: 29.4, z: 105.08 },
    { x: 9.67, z: 89.35 },
    { x: -1.28, z: 66.62 },
    { x: -1.28, z: 41.38 },
    { x: 9.67, z: 18.65 },
    { x: 29.4, z: 2.92 },
  ],
}
