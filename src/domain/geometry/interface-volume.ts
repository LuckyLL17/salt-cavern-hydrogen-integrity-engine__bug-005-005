import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { frustumVolumeM3, partialFrustumVolumeM3 } from './frustum.ts';
import { prepareSurvey } from './survey.ts';

/**
 * 整理后的测腔曲线及其分段体积。
 * prefixVolumesM3[i] 为从顶深累计到第 i 个站位的体积，
 * 正向累加与体积反解共用这一份数据，边界语义天然一致。
 */
export type GeometryCurve = {
  points: GeometryPoint[];
  segmentVolumesM3: number[];
  prefixVolumesM3: number[];
  totalVolumeM3: number;
};

export function buildGeometryCurve(points: GeometryPoint[]): GeometryCurve {
  const prepared = prepareSurvey(points);
  const segmentVolumesM3 = prepared.slice(1).map((bottom, index) => frustumVolumeM3(prepared[index], bottom));
  const prefixVolumesM3 = [0];
  for (const segmentVolume of segmentVolumesM3) prefixVolumesM3.push(prefixVolumesM3.at(-1)! + segmentVolume);
  return { points: prepared, segmentVolumesM3, prefixVolumesM3, totalVolumeM3: prefixVolumesM3.at(-1)! };
}

/**
 * 累计体积 V(depth)：单调不减、连续的分段函数。
 * - 端点精确：站位深度返回对应前缀体积（不跨段重复累加）；
 * - 区间外常数延拓：浅于顶深为 0，深于底深为总容积，与 radiusAtDepth 的延拓约定一致；
 * - 段内按圆台公式切开，任意切开后两段体积之和等于整段体积（可复核）。
 */
export function cumulativeVolumeAtDepth(curve: GeometryCurve, requestedDepthM: number): number {
  if (!Number.isFinite(requestedDepthM)) throw new DomainError('DEPTH_OUTSIDE_GEOMETRY', 'Depth must be a finite number', 422, { requestedDepthM });
  const { points, prefixVolumesM3, totalVolumeM3 } = curve;
  if (requestedDepthM <= points[0].depthM) return 0;
  const lastIndex = points.length - 1;
  if (requestedDepthM >= points[lastIndex].depthM) return totalVolumeM3;
  // 找满足 points[i].depthM <= requestedDepthM 的最大 i（严格递增站位下唯一）
  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (points[middle].depthM <= requestedDepthM) low = middle; else high = middle - 1;
  }
  return prefixVolumesM3[low] + partialFrustumVolumeM3(points[low], points[low + 1], requestedDepthM);
}

export function cavernVolumeToDepth(points: GeometryPoint[], requestedDepthM: number): number {
  return cumulativeVolumeAtDepth(buildGeometryCurve(points), requestedDepthM);
}

export function cavernVolumeM3(points: GeometryPoint[]): number {
  return buildGeometryCurve(points).totalVolumeM3;
}
