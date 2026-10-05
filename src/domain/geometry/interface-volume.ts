import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { frustumVolumeM3, radiusAtDepth } from './frustum.ts';
import { prepareSurvey } from './survey.ts';
export function cumulativeVolumesOnCurve(curve: GeometryPoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < curve.length; index += 1) cumulative.push(cumulative[index - 1] + frustumVolumeM3(curve[index - 1], curve[index]));
  return cumulative;
}
export function volumeToDepthOnCurve(curve: GeometryPoint[], requestedDepthM: number): number {
  const topDepthM = curve[0].depthM;
  const bottomDepthM = curve.at(-1)!.depthM;
  if (!Number.isFinite(requestedDepthM) || requestedDepthM < topDepthM || requestedDepthM > bottomDepthM) throw new DomainError('DEPTH_OUTSIDE_GEOMETRY', 'Depth is outside the measured cavern interval', 422, { requestedDepthM, intervalTopM: topDepthM, intervalBottomM: bottomDepthM });
  let volume = 0;
  for (let index = 1; index < curve.length; index += 1) {
    const top = curve[index - 1]; const bottom = curve[index];
    if (requestedDepthM >= bottom.depthM) { volume += frustumVolumeM3(top, bottom); continue; }
    if (requestedDepthM > top.depthM) volume += frustumVolumeM3(top, { depthM: requestedDepthM, radiusM: radiusAtDepth(top, bottom, requestedDepthM) });
    break;
  }
  return volume;
}
export function cavernVolumeToDepth(points: GeometryPoint[], requestedDepthM: number): number {
  return volumeToDepthOnCurve(prepareSurvey(points), requestedDepthM);
}
export function cavernVolumeM3(points: GeometryPoint[]): number {
  return cumulativeVolumesOnCurve(prepareSurvey(points)).at(-1)!;
}
export function cumulativeVolumesM3(points: GeometryPoint[]): number[] {
  return cumulativeVolumesOnCurve(prepareSurvey(points));
}
