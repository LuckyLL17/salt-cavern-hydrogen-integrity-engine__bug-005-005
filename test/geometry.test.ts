import test from 'node:test';
import assert from 'node:assert/strict';
import { frustumVolumeM3, radiusAtDepth, partialFrustumVolumeM3 } from '../src/domain/geometry/frustum.ts';
import { prepareSurvey } from '../src/domain/geometry/survey.ts';
import {
  buildGeometryCurve,
  cumulativeVolumeAtDepth,
} from '../src/domain/geometry/interface-volume.ts';
import { cavernVolumeM3, volumeToDepthM3 } from '../src/domain/cavern-geometry.ts';
import { depthAtCumulativeVolume, depthForCurveVolume } from '../src/domain/geometry/inversion.ts';

const cylinder = [
  { depthM: 100, radiusM: 2 },
  { depthM: 120, radiusM: 2 },
  { depthM: 150, radiusM: 2 },
];

test('frustum volume matches analytic cone and cylinder references', () => {
  assert.ok(Math.abs(frustumVolumeM3({ depthM: 0, radiusM: 2 }, { depthM: 25, radiusM: 2 }) - Math.PI * 4 * 25) < 1e-9);
  assert.ok(Math.abs(frustumVolumeM3({ depthM: 10, radiusM: 0 }, { depthM: 20, radiusM: 3 }) - (Math.PI / 3) * 10 * 9) < 1e-9);
  assert.equal(frustumVolumeM3({ depthM: 5, radiusM: 3 }, { depthM: 5, radiusM: 4 }), 0);
});

test('cutting a segment anywhere preserves additivity even with abrupt radius change', () => {
  const top = { depthM: 100, radiusM: 0.5 };
  const bottom = { depthM: 112, radiusM: 7.25 };
  for (const cutDepth of [100.0001, 103, 106, 111.9999, 112]) {
    const cut = { depthM: cutDepth, radiusM: radiusAtDepth(top, bottom, cutDepth) };
    const recombined = frustumVolumeM3(top, cut) + frustumVolumeM3(cut, bottom);
    assert.ok(Math.abs(recombined - frustumVolumeM3(top, bottom)) < 1e-8);
  }
});

test('radius interpolation shares one boundary convention: endpoints and outside extension', () => {
  const top = { depthM: 10, radiusM: 2 };
  const bottom = { depthM: 20, radiusM: 4 };
  assert.equal(radiusAtDepth(top, bottom, 10), 2);
  assert.equal(radiusAtDepth(top, bottom, 20), 4);
  assert.equal(radiusAtDepth(top, bottom, 5), 2);
  assert.equal(radiusAtDepth(top, bottom, 25), 4);
  assert.equal(radiusAtDepth(top, bottom, 15), 3);
  assert.equal(radiusAtDepth({ depthM: 7, radiusM: 3 }, { depthM: 7, radiusM: 9 }, 7), 3);
});

test('cumulative volume is exact at every station and equals summed segments', () => {
  const curve = buildGeometryCurve(cylinder);
  assert.deepEqual(curve.prefixVolumesM3.map((v) => Math.round(v * 1e9) / 1e9), [0, Math.round(Math.PI * 4 * 20 * 1e9) / 1e9, Math.round(Math.PI * 4 * 50 * 1e9) / 1e9]);
  assert.equal(cumulativeVolumeAtDepth(curve, 100), 0);
  assert.ok(Math.abs(cumulativeVolumeAtDepth(curve, 120) - Math.PI * 4 * 20) < 1e-9);
  assert.equal(cumulativeVolumeAtDepth(curve, 150), curve.totalVolumeM3);
  const summed = curve.segmentVolumesM3.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(summed - curve.totalVolumeM3) < 1e-9);
});

test('out-of-interval depth queries extend by a constant convention', () => {
  const curve = buildGeometryCurve(cylinder);
  assert.equal(cumulativeVolumeAtDepth(curve, 0), 0);
  assert.equal(cumulativeVolumeAtDepth(curve, 999), curve.totalVolumeM3);
  assert.equal(partialFrustumVolumeM3(curve.points[0], curve.points[1], 50), 0);
  assert.equal(partialFrustumVolumeM3(curve.points[0], curve.points[1], 500), curve.segmentVolumesM3[0]);
  assert.throws(() => cumulativeVolumeAtDepth(curve, Number.NaN), (error: { code?: string }) => error.code === 'DEPTH_OUTSIDE_GEOMETRY');
});

test('cumulative volume is monotone and continuous across stations and radius jumps', () => {
  const points = [
    { depthM: 0, radiusM: 0 },
    { depthM: 10, radiusM: 5 },
    { depthM: 10.0001, radiusM: 1 },
    { depthM: 20, radiusM: 1 },
    { depthM: 30, radiusM: 4 },
  ];
  const curve = buildGeometryCurve(points);
  let previous = -1;
  for (let depth = 0; depth <= 30; depth += 0.25) {
    const volume = cumulativeVolumeAtDepth(curve, depth);
    assert.ok(volume >= previous - 1e-12, `volume decreases at ${depth}`);
    previous = volume;
  }
  const station = 20;
  const fromBelow = cumulativeVolumeAtDepth(curve, station - 1e-9);
  const atStation = cumulativeVolumeAtDepth(curve, station);
  const fromAbove = cumulativeVolumeAtDepth(curve, station + 1e-9);
  assert.ok(Math.abs(fromBelow - atStation) < 1e-6);
  assert.ok(fromAbove >= atStation - 1e-12);
});

test('zero-radius tips and zero-radius plateaus use the tip/start convention', () => {
  const points = [
    { depthM: 0, radiusM: 0 },
    { depthM: 10, radiusM: 3 },
    { depthM: 20, radiusM: 0 },
    { depthM: 30, radiusM: 0 },
    { depthM: 40, radiusM: 2 },
  ];
  const curve = buildGeometryCurve(points);
  const coneVolume = (Math.PI / 3) * 10 * 9;
  assert.ok(Math.abs(curve.segmentVolumesM3[0] - coneVolume) < 1e-9);
  assert.equal(curve.segmentVolumesM3[2], 0);
  const plateauStartVolume = curve.prefixVolumesM3[3];
  assert.equal(depthForCurveVolume(curve, plateauStartVolume), 20);
  assert.ok(Math.abs(depthForCurveVolume(curve, coneVolume) - 10) < 1e-9);
  assert.equal(depthForCurveVolume(curve, 0), 0);
  assert.equal(depthForCurveVolume(curve, curve.totalVolumeM3), 40);
});

test('duplicate depths are merged under one coordinate convention, regardless of input order', () => {
  const shuffled = [
    { depthM: 150, radiusM: 2 },
    { depthM: 100, radiusM: 2, uncertaintyM: 1 },
    { depthM: 120, radiusM: 4, uncertaintyM: 1 },
    { depthM: 120, radiusM: 2, uncertaintyM: 1 },
  ];
  const prepared = prepareSurvey(shuffled);
  assert.deepEqual(prepared.map((p) => p.depthM), [100, 120, 150]);
  assert.equal(prepared[1].radiusM, 3);
  for (let index = 1; index < prepared.length; index += 1) assert.ok(prepared[index].depthM > prepared[index - 1].depthM);
  const mergedTotal = cavernVolumeM3(shuffled);
  const equivalentTotal = cavernVolumeM3([
    { depthM: 100, radiusM: 2 },
    { depthM: 120, radiusM: 3 },
    { depthM: 150, radiusM: 2 },
  ]);
  assert.ok(Math.abs(mergedTotal - equivalentTotal) < 1e-9);
});

test('tolerance merging weights depth and radius consistently and keeps strict increase', () => {
  const near = [
    { depthM: 0, radiusM: 1, uncertaintyM: 0.5 },
    { depthM: 0.02, radiusM: 2, uncertaintyM: 0.5 },
    { depthM: 10, radiusM: 3 },
  ];
  const prepared = prepareSurvey(near, { mergeToleranceM: 0.05 });
  assert.equal(prepared.length, 2);
  assert.ok(Math.abs(prepared[0].depthM - 0.01) < 1e-12);
  assert.ok(Math.abs(prepared[0].radiusM - 1.5) < 1e-12);
  assert.ok(prepared[1].depthM > prepared[0].depthM);
});

test('volume-to-depth inversion and piecewise accumulation invert each other', () => {
  const points = [
    { depthM: 50, radiusM: 1 },
    { depthM: 70, radiusM: 3.5 },
    { depthM: 95, radiusM: 2 },
    { depthM: 130, radiusM: 4 },
  ];
  const curve = buildGeometryCurve(points);
  for (const depth of [50, 60, 70, 82.5, 95, 110, 130]) {
    const volume = cumulativeVolumeAtDepth(curve, depth);
    const back = depthForCurveVolume(curve, volume, 1e-7);
    assert.ok(Math.abs(back - depth) < 1e-4, `round trip failed at ${depth}: got ${back}`);
  }
  for (let k = 1; k < 10; k += 1) {
    const target = (curve.totalVolumeM3 * k) / 10;
    const depth = depthForCurveVolume(curve, target, 1e-8);
    assert.ok(Math.abs(cumulativeVolumeAtDepth(curve, depth) - target) < 1e-6);
  }
  assert.equal(depthAtCumulativeVolume(points, 0), 50);
  assert.equal(depthAtCumulativeVolume(points, curve.totalVolumeM3), 130);
  const isInvalidTarget = (error: { code?: string }) => error.code === 'INVALID_VOLUME_TARGET';
  assert.throws(() => depthAtCumulativeVolume(points, -1), isInvalidTarget);
  assert.throws(() => depthAtCumulativeVolume(points, curve.totalVolumeM3 + 1), isInvalidTarget);
});

test('legacy cylinder workflow still resolves to the analytic midpoint depth', () => {
  const depth = depthAtCumulativeVolume(cylinder, Math.PI * 2 ** 2 * 25);
  assert.ok(Math.abs(depth - 125) < 1e-3);
  assert.ok(cavernVolumeM3(cylinder) > volumeToDepthM3(cylinder, 125));
});
