import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScriptModule } from "./helpers/import-typescript-module.mjs";

const quality = await importTypeScriptModule("../app/game/scene-quality.ts");
const generator = await importTypeScriptModule("../app/game/scene-question-generator.ts");
const candidates = await importTypeScriptModule("../app/game/scene-candidates.ts");

function pixels(colors) {
  return { width: colors.length, height: 1, data: colors.flatMap((c) => [...c, 255]) };
}

test("visibility measures color variation rather than fine-detail density or alpha", () => {
  for (const c of [[0,0,0], [255,255,255], [25,70,180]]) {
    assert.equal(quality.sceneColorVariance(pixels([c,c,c,c])), 0);
  }
  const twoRegions = pixels([[0,0,0], [0,0,0], [255,255,255], [255,255,255]]);
  assert.ok(Math.abs(quality.sceneColorVariance(twoRegions) - 3/4) < Number.EPSILON);
  const alphaOnly = { width: 2, height: 1, data: [0,0,0,0,0,0,0,255] };
  assert.equal(quality.sceneColorVariance(alphaOnly), 0);
  assert.throws(() => quality.sceneColorVariance({width: 2,height: 2,data: []}));
});

test("threshold comes from rejected references and requires separable visible controls", () => {
  const nearFlat = quality.sceneColorVariance(pixels([[100,100,100], [102,102,102]]));
  const visible = quality.sceneColorVariance(pixels([[0,0,0], [255,255,255]]));
  const samples = [{id:"flat",label:"near-flat",energy:nearFlat}, {id:"scene",label:"visible",energy:visible}];
  const threshold = quality.calibrateSceneThreshold(samples);
  assert.equal(threshold, nearFlat);
  assert.equal(quality.hasVisibleScene(nearFlat, threshold), false);
  assert.equal(quality.hasVisibleScene(visible, threshold), true);
  assert.equal(quality.hasVisibleScene(NaN, threshold), false);
  assert.throws(() => quality.calibrateSceneThreshold([]));
  assert.throws(() => quality.calibrateSceneThreshold([{id:"bad",label:"near-flat",energy:visible}, {id:"control",label:"visible",energy:nearFlat}]));
});

test("projection uses image scale, finite coordinates and reproducible independent anchors", () => {
  assert.equal(candidates.probeExterior(0,0,1000).escaped, false);
  const exterior = candidates.probeExterior(2,2,1000);
  assert.equal(exterior.escaped, true);
  assert.ok(Number.isFinite(exterior.distance) && exterior.distance > 0);
  for (const m of [10,75.5,1000,10000]) {
    const a = candidates.createSceneCandidateSampler(m,42,192,120);
    const b = candidates.createSceneCandidateSampler(m,42,192,120);
    let found = 0;
    for (let n=0;n<50;n++) {
      const first=a();
      assert.deepEqual(first,b());
      if (!first) continue;
      found++;
      assert.equal(first.camera.viewportWidth,3.6/m);
      assert.ok(first.camera.centerRe>=-2.35 && first.camera.centerRe<=1.25);
      assert.ok(first.camera.centerIm>=-1.125 && first.camera.centerIm<=1.125);
      assert.ok(Number.isFinite(first.representative.re) && Number.isFinite(first.representative.im));
    }
    assert.ok(found>0);
  }
});

function analyzerFactory(measure, disposed) {
  return (paletteId) => ({threshold:0,paletteId,measurements:[{id:"constant",label:"near-flat",energy:0},{id:"two-regions",label:"visible",energy:3/4}],measure,dispose:()=>disposed.push(true)});
}

test("round count preserves the prefix and no history-dependent novelty rule is applied", async () => {
  const disposed=[];
  const options={analyzerFactory:analyzerFactory((camera)=>camera.centerIm>0 ? 3/4 : 0,disposed)};
  const short=await generator.generateSceneQuestionBatch({magnification:75.5,count:3,seed:20260820},options);
  const long=await generator.generateSceneQuestionBatch({magnification:75.5,count:10,seed:20260820},options);
  assert.deepEqual(short.questions,long.questions.slice(0,3));
  assert.equal(disposed.length,2);
  assert.ok(short.stats.qualityRejected>0);
  assert.equal(short.stats.candidatesTested,short.stats.accepted+short.stats.projectionRejected+short.stats.qualityRejected);
  const next=candidates.createSceneCandidateSampler(75.5,20260820,192,120);
  const expected=[];
  while (expected.length<10) {
    const candidate=next();
    if (candidate && candidate.camera.centerIm>0) expected.push(candidate.camera);
  }
  assert.deepEqual(long.questions.map(q=>q.camera),expected,"every qualifying proposal is accepted in order, including similar landscapes");
  for (const q of long.questions) {
    assert.ok(q.camera.centerIm>0);
    assert.equal(q.generation.quality.energy,3/4);
    assert.equal(q.boundaryCell,undefined);
    assert.equal(q.generation.quality.metricVersion,quality.SCENE_QUALITY_METRIC_VERSION);
  }
});

test("exhaustion and cancellation dispose the renderer and never return flat substitutes", async () => {
  const disposed=[];
  await assert.rejects(generator.generateSceneQuestionBatch({magnification:100,count:2,seed:1},{maxProposals:5,analyzerFactory:analyzerFactory(()=>0,disposed)}),/単色判定/);
  assert.equal(disposed.length,1);
  const controller=new AbortController();
  await assert.rejects(generator.generateSceneQuestionBatch({magnification:100,count:1,seed:1},{signal:controller.signal,analyzerFactory:analyzerFactory(()=>{controller.abort();return 3/4;},disposed)}),{name:"AbortError"});
  assert.equal(disposed.length,2);
  await assert.rejects(generator.generateSceneQuestionBatch({magnification:100,count:1,seed:1},{signal:controller.signal,analyzerFactory:()=>{throw new Error("must not create a renderer");}}),{name:"AbortError"});
});
