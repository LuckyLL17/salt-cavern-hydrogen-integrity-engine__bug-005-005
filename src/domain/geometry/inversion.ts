import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { buildGeometryCurve, cumulativeVolumeAtDepth, type GeometryCurve } from './interface-volume.ts';

/**
 * 在已整理曲线上反解累计体积对应的深度。
 * 与累计体积共享 buildGeometryCurve 产出的前缀体积，边界语义完全一致：
 * - 0 体积精确返回顶深，总体积精确返回底深（不做近似二分）；
 * - 站位体积精确返回对应站位深度；
 * - 零半径段形成的体积平台，取“首次达到该体积的最浅深度”（平台起点）；
 * - 段内二分的判定函数就是 cumulativeVolumeAtDepth，正算与反查可互相复核。
 */
export function depthForCurveVolume(curve: GeometryCurve, targetVolumeM3: number, toleranceM = 1e-5): number {
  if (!Number.isFinite(targetVolumeM3) || targetVolumeM3 < 0 || targetVolumeM3 > curve.totalVolumeM3 || !(toleranceM > 0)) {
    throw new DomainError('INVALID_VOLUME_TARGET', 'Requested cumulative volume or inversion tolerance is invalid', 422, { targetVolumeM3, total: curve.totalVolumeM3, toleranceM });
  }
  const { points, prefixVolumesM3 } = curve;
  if (targetVolumeM3 === 0) return points[0].depthM;
  if (targetVolumeM3 === curve.totalVolumeM3) return points.at(-1)!.depthM;
  // 定位包含目标的段：最小的 i 使 prefix[i+1] >= target，
  // 这保证体积平台（零半径段）取平台起点。
  let segmentIndex = 0;
  while (targetVolumeM3 > prefixVolumesM3[segmentIndex + 1]) segmentIndex += 1;
  if (targetVolumeM3 === prefixVolumesM3[segmentIndex + 1]) return points[segmentIndex + 1].depthM;
  const topDepthM = points[segmentIndex].depthM;
  const bottomDepthM = points[segmentIndex + 1].depthM;
  let low = topDepthM;
  let high = bottomDepthM;
  for (let iteration = 0; iteration < 80 && high - low > toleranceM; iteration += 1) {
    const middle = (low + high) / 2;
    if (cumulativeVolumeAtDepth(curve, middle) < targetVolumeM3) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function depthAtCumulativeVolume(points: GeometryPoint[], targetVolumeM3: number, toleranceM = 1e-5): number {
  return depthForCurveVolume(buildGeometryCurve(points), targetVolumeM3, toleranceM);
}
