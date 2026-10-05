import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
function validatePoint(point: GeometryPoint): void { if (!Number.isFinite(point.depthM) || !Number.isFinite(point.radiusM) || point.radiusM < 0) throw new DomainError('INVALID_GEOMETRY_POINT', 'Survey depth or radius is outside the accepted physical range', 422, { point }); }
function validateSegment(top: GeometryPoint, bottom: GeometryPoint): void { if (bottom.depthM < top.depthM) throw new DomainError('INVALID_GEOMETRY_SEGMENT', 'Segment bottom must not be shallower than its top', 422, { topDepthM: top.depthM, bottomDepthM: bottom.depthM }); }
export function frustumVolumeM3(top: GeometryPoint, bottom: GeometryPoint): number {
  validatePoint(top); validatePoint(bottom); validateSegment(top, bottom);
  const heightM = bottom.depthM - top.depthM;
  return (Math.PI * heightM * (top.radiusM ** 2 + top.radiusM * bottom.radiusM + bottom.radiusM ** 2)) / 3;
}
export function radiusAtDepth(top: GeometryPoint, bottom: GeometryPoint, depthM: number): number {
  validatePoint(top); validatePoint(bottom); validateSegment(top, bottom);
  if (!Number.isFinite(depthM) || depthM < top.depthM || depthM > bottom.depthM) throw new DomainError('DEPTH_OUTSIDE_GEOMETRY', 'Depth is outside the segment interval', 422, { requestedDepthM: depthM, intervalTopM: top.depthM, intervalBottomM: bottom.depthM });
  const intervalM = bottom.depthM - top.depthM;
  if (intervalM === 0) return top.radiusM;
  return top.radiusM + ((depthM - top.depthM) / intervalM) * (bottom.radiusM - top.radiusM);
}
