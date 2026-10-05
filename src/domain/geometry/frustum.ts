import type { GeometryPoint } from '../types.ts';

// 统一坐标约定：深度沿向下方向增大，半径非负。
// 任意曲线必须先经 prepareSurvey 整理为深度严格递增的站位序列，
// 截锥段、累计体积与深度反解都基于同一约定，保证分段可加与端点一致。

const FRUSTUM_FACTOR = Math.PI / 3;

export function segmentArea(radiusM: number): number {
  return Math.PI * radiusM * radiusM;
}

export function validatePoint(point: GeometryPoint): void {
  if (!Number.isFinite(point.depthM) || !Number.isFinite(point.radiusM) || point.depthM < 0 || point.radiusM < 0) {
    throw new Error('Invalid geometry point');
  }
}

/**
 * 圆台（截锥）段体积：V = h·π/3·(r1² + r2² + r1·r2)。
 * 该公式对零半径（锥体尖端）与等半径（圆柱）均成立，
 * 且满足可加性：把同一段在任意内部深度切开后两段体积之和等于整段体积。
 */
export function frustumVolumeM3(top: GeometryPoint, bottom: GeometryPoint): number {
  validatePoint(top);
  validatePoint(bottom);
  const height = bottom.depthM - top.depthM;
  if (!Number.isFinite(height) || height < 0) throw new Error('Geometry segment must run from top to bottom');
  if (height === 0) return 0;
  const r1 = top.radiusM;
  const r2 = bottom.radiusM;
  return FRUSTUM_FACTOR * height * (r1 * r1 + r2 * r2 + r1 * r2);
}

/**
 * 半径沿深度线性插值。
 * 区间外采用常数延拓：浅于顶深取顶半径，深于底深取底半径；
 * 重复深度（零高度段）返回该站位半径。端点闭区间取端点本身。
 */
export function radiusAtDepth(top: GeometryPoint, bottom: GeometryPoint, depthM: number): number {
  validatePoint(top);
  validatePoint(bottom);
  if (!Number.isFinite(depthM)) throw new Error('Query depth must be finite');
  if (depthM <= top.depthM) return top.radiusM;
  if (depthM >= bottom.depthM) return bottom.radiusM;
  const interval = bottom.depthM - top.depthM;
  if (interval === 0) return top.radiusM;
  return top.radiusM + ((depthM - top.depthM) / interval) * (bottom.radiusM - top.radiusM);
}

/**
 * [top, bottom] 段从顶深累计到 depthM 的部分体积。
 * 与 radiusAtDepth 共用同一插值约定：区间外延拓为常数，
 * 端点返回 0（顶）或整段体积（底），从而与全曲线分段累加的边界语义完全一致。
 */
export function partialFrustumVolumeM3(top: GeometryPoint, bottom: GeometryPoint, depthM: number): number {
  const fullHeight = bottom.depthM - top.depthM;
  if (fullHeight < 0) throw new Error('Geometry segment must run from top to bottom');
  if (depthM <= top.depthM || fullHeight === 0) return 0;
  if (depthM >= bottom.depthM) return frustumVolumeM3(top, bottom);
  const radius = radiusAtDepth(top, bottom, depthM);
  return frustumVolumeM3(top, { depthM, radiusM: radius });
}
