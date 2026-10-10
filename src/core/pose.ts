import { lerp, lerpAngle } from './math.ts'

export interface Pose {
  x: number
  z: number
  yaw: number
  steer: number
}

export function mixPose(previous: Pose, current: Pose, alpha: number): Pose {
  return {
    x: lerp(previous.x, current.x, alpha),
    z: lerp(previous.z, current.z, alpha),
    yaw: lerpAngle(previous.yaw, current.yaw, alpha),
    steer: lerp(previous.steer, current.steer, alpha),
  }
}
