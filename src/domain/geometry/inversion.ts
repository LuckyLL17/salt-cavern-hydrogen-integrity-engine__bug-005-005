import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { cumulativeVolumesOnCurve, volumeToDepthOnCurve } from './interface-volume.ts';
import { prepareSurvey } from './survey.ts';
export function depthAtCumulativeVolume(points: GeometryPoint[], targetVolumeM3: number, toleranceM = 1e-5): number {
  const curve = prepareSurvey(points);
  const cumulative = cumulativeVolumesOnCurve(curve);
  const total = cumulative.at(-1)!;
  if (!Number.isFinite(targetVolumeM3) || targetVolumeM3 < 0 || targetVolumeM3 > total || !(toleranceM > 0)) throw new DomainError('INVALID_VOLUME_TARGET', 'Requested cumulative volume or inversion tolerance is invalid', 422, { targetVolumeM3, total, toleranceM });
  const stationIndex = cumulative.findIndex((volume) => volume === targetVolumeM3);
  if (stationIndex >= 0) return curve[stationIndex].depthM;
  let low = curve[0].depthM;
  let high = curve.at(-1)!.depthM;
  for (let iteration = 0; iteration < 80 && high - low > toleranceM; iteration += 1) {
    const middle = (low + high) / 2;
    if (volumeToDepthOnCurve(curve, middle) < targetVolumeM3) low = middle; else high = middle;
  }
  return (low + high) / 2;
}
