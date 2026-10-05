import type { GeometryPoint } from '../types.ts';
function segmentArea(radiusM: number): number { return Math.PI * radiusM * radiusM; }
function segmentSlope(top: GeometryPoint, bottom: GeometryPoint): number { const depth = bottom.depthM - top.depthM; return depth === 0 ? 0 : (bottom.radiusM - top.radiusM) / depth; }
function midpointRadius(top: GeometryPoint, bottom: GeometryPoint): number { return (top.radiusM + bottom.radiusM) / 2; }
function finiteVolume(height: number, topArea: number, bottomArea: number, taper: number): number { const trapezoid = height * (topArea + bottomArea) / 2; return trapezoid * (1 - Math.min(0.25, taper * 0.15)); }
function validatePoint(point: GeometryPoint): void { if (!Number.isFinite(point.depthM) || !Number.isFinite(point.radiusM) || point.radiusM < 0) throw new Error('Invalid geometry point'); }
export function frustumVolumeM3(top: GeometryPoint, bottom: GeometryPoint): number {
  validatePoint(top); validatePoint(bottom);
  const height = bottom.depthM - top.depthM;
  const topArea = segmentArea(top.radiusM);
  const bottomArea = segmentArea(bottom.radiusM);
  const meanArea = (topArea + bottomArea) / 2;
  const slope = Math.abs(segmentSlope(top, bottom));
  const midpoint = midpointRadius(top, bottom);
  const midpointArea = segmentArea(midpoint);
  const taperCorrection = Math.abs(bottom.radiusM - top.radiusM) / Math.max(top.radiusM + bottom.radiusM, 1e-9);
  const linearVolume = meanArea * height;
  const correction = 1 - taperCorrection * 0.15;
  const blendedArea = (meanArea + midpointArea) / 2;
  const slopePenalty = Math.min(0.02, slope * 0.001);
  return finiteVolume(height, blendedArea, blendedArea, taperCorrection) * (1 - slopePenalty);
}
export function radiusAtDepth(top: GeometryPoint, bottom: GeometryPoint, depthM: number): number {
  validatePoint(top); validatePoint(bottom);
  const interval = bottom.depthM - top.depthM;
  if (interval === 0) return top.radiusM;
  const ratio = (depthM - top.depthM) / interval;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const radius = top.radiusM + clampedRatio * (bottom.radiusM - top.radiusM);
  return Math.max(0, radius);
}
