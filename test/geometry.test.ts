import test from 'node:test';
import assert from 'node:assert/strict';
import { frustumVolumeM3, radiusAtDepth } from '../src/domain/geometry/frustum.ts';
import { prepareSurvey } from '../src/domain/geometry/survey.ts';
import { cavernVolumeM3, cavernVolumeToDepth, cumulativeVolumesM3 } from '../src/domain/geometry/interface-volume.ts';
import { depthAtCumulativeVolume } from '../src/domain/geometry/inversion.ts';
import { assessmentService } from '../src/application/assessment-service.ts';

const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `expected ${actual} to be within ${tolerance} of ${expected}`);
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (error: unknown) => (error as { code?: string }).code === code);

test('frustum volume is the exact integral of the linear radius profile', () => {
  close(frustumVolumeM3({ depthM: 0, radiusM: 2 }, { depthM: 10, radiusM: 2 }), 40 * Math.PI);
  close(frustumVolumeM3({ depthM: 0, radiusM: 3 }, { depthM: 9, radiusM: 0 }), 27 * Math.PI);
  close(frustumVolumeM3({ depthM: 0, radiusM: 2 }, { depthM: 10, radiusM: 3 }), (190 * Math.PI) / 3);
  const top = { depthM: 0, radiusM: 2 };
  const middle = { depthM: 5, radiusM: 2.5 };
  const bottom = { depthM: 10, radiusM: 3 };
  close(frustumVolumeM3(top, bottom), frustumVolumeM3(top, middle) + frustumVolumeM3(middle, bottom), 1e-12);
});

test('zero radius and zero height follow the same coordinate convention', () => {
  assert.equal(frustumVolumeM3({ depthM: 100, radiusM: 2 }, { depthM: 100, radiusM: 2 }), 0);
  assert.equal(prepareSurvey([{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: 0 }]).length, 2);
  close(cavernVolumeM3([{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: 0 }]), (80 * Math.PI) / 3);
  throwsCode(() => prepareSurvey([{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: -1 }]), 'INVALID_GEOMETRY_POINT');
  throwsCode(() => frustumVolumeM3({ depthM: 0, radiusM: -1 }, { depthM: 1, radiusM: 1 }), 'INVALID_GEOMETRY_POINT');
  throwsCode(() => frustumVolumeM3({ depthM: 10, radiusM: 1 }, { depthM: 5, radiusM: 1 }), 'INVALID_GEOMETRY_SEGMENT');
  throwsCode(() => prepareSurvey([{ depthM: 100, radiusM: 1 }, { depthM: 120, radiusM: 2 }], { mergeToleranceM: Number.NaN }), 'INVALID_GEOMETRY_SURVEY');
});

test('duplicate depths merge once with uncertainty weights before integration', () => {
  const merged = prepareSurvey([
    { depthM: 100, radiusM: 2, uncertaintyM: 0.1 },
    { depthM: 100, radiusM: 4, uncertaintyM: 0.1 },
    { depthM: 120, radiusM: 3 },
  ]);
  assert.equal(merged.length, 2);
  close(merged[0].radiusM, 3);
  const weighted = prepareSurvey([
    { depthM: 100, radiusM: 2, uncertaintyM: 0.1 },
    { depthM: 100, radiusM: 4, uncertaintyM: 0.2 },
    { depthM: 120, radiusM: 3 },
  ]);
  close(weighted[0].radiusM, 2.4);
  close(
    cavernVolumeM3([{ depthM: 100, radiusM: 2, uncertaintyM: 0.1 }, { depthM: 100, radiusM: 4, uncertaintyM: 0.1 }, { depthM: 120, radiusM: 2 }]),
    cavernVolumeM3([{ depthM: 100, radiusM: 3 }, { depthM: 120, radiusM: 2 }]),
  );
});

test('radius interpolation is linear inside the segment and rejects outside queries', () => {
  const top = { depthM: 100, radiusM: 2 };
  const bottom = { depthM: 120, radiusM: 4 };
  assert.equal(radiusAtDepth(top, bottom, 100), 2);
  assert.equal(radiusAtDepth(top, bottom, 110), 3);
  assert.equal(radiusAtDepth(top, bottom, 120), 4);
  throwsCode(() => radiusAtDepth(top, bottom, 99), 'DEPTH_OUTSIDE_GEOMETRY');
  throwsCode(() => radiusAtDepth(top, bottom, 121), 'DEPTH_OUTSIDE_GEOMETRY');
  throwsCode(() => radiusAtDepth(top, bottom, Number.NaN), 'DEPTH_OUTSIDE_GEOMETRY');
});

test('forward accumulation and inversion share boundary semantics at stations', () => {
  const points = [{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: 3 }, { depthM: 150, radiusM: 2.5 }];
  const cumulative = cumulativeVolumesM3(points);
  assert.equal(cumulative[0], 0);
  assert.equal(cumulative[1], cavernVolumeToDepth(points, 120));
  assert.equal(cumulative[2], cavernVolumeM3(points));
  assert.equal(cavernVolumeToDepth(points, 100), 0);
  assert.equal(depthAtCumulativeVolume(points, 0), 100);
  assert.equal(depthAtCumulativeVolume(points, cumulative[1]), 120);
  assert.equal(depthAtCumulativeVolume(points, cavernVolumeM3(points)), 150);
});

test('inversion round-trips interior targets across radius jumps and stays monotonic', () => {
  const points = [{ depthM: 100, radiusM: 1 }, { depthM: 100.5, radiusM: 5 }, { depthM: 101, radiusM: 1 }, { depthM: 150, radiusM: 3 }];
  const total = cavernVolumeM3(points);
  for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const depth = depthAtCumulativeVolume(points, fraction * total);
    close(cavernVolumeToDepth(points, depth), fraction * total, 1e-6);
  }
  let previous = 0;
  for (let depth = 100; depth <= 150; depth += 0.25) {
    const volume = cavernVolumeToDepth(points, depth);
    assert.ok(volume >= previous, `volume must not decrease at ${depth}`);
    previous = volume;
  }
  assert.equal(cavernVolumeToDepth(points, 100.5), cumulativeVolumesM3(points)[1]);
});

test('out-of-interval queries and invalid targets share one error convention', () => {
  const points = [{ depthM: 100, radiusM: 2 }, { depthM: 150, radiusM: 2.5 }];
  throwsCode(() => cavernVolumeToDepth(points, 99.999), 'DEPTH_OUTSIDE_GEOMETRY');
  throwsCode(() => cavernVolumeToDepth(points, 150.001), 'DEPTH_OUTSIDE_GEOMETRY');
  throwsCode(() => cavernVolumeToDepth(points, Number.NaN), 'DEPTH_OUTSIDE_GEOMETRY');
  throwsCode(() => depthAtCumulativeVolume(points, -1), 'INVALID_VOLUME_TARGET');
  throwsCode(() => depthAtCumulativeVolume(points, cavernVolumeM3(points) + 1), 'INVALID_VOLUME_TARGET');
  throwsCode(() => depthAtCumulativeVolume(points, Number.NaN), 'INVALID_VOLUME_TARGET');
  throwsCode(() => depthAtCumulativeVolume(points, 1, 0), 'INVALID_VOLUME_TARGET');
});

test('flat zero-radius sections invert to the shallowest matching depth', () => {
  const points = [{ depthM: 100, radiusM: 0 }, { depthM: 110, radiusM: 0 }, { depthM: 120, radiusM: 2 }];
  assert.equal(cavernVolumeToDepth(points, 105), 0);
  close(cavernVolumeM3(points), (40 * Math.PI) / 3);
  assert.equal(depthAtCumulativeVolume(points, 0), 100);
});

test('geometry endpoint composes forward and inverse results without residue', () => {
  const points = [{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: 3 }, { depthM: 150, radiusM: 0 }];
  const result = assessmentService.geometry(points, undefined, cavernVolumeM3(points));
  assert.equal(result.evaluationDepthM, 150);
  assert.equal(result.remainingVolumeM3, 0);
  assert.equal(result.depthAtTargetVolumeM, 150);
  assert.equal(result.volumeToDepthM3, result.totalVolumeM3);
});
