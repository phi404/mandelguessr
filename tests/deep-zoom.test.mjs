import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './helpers/import-typescript-module.mjs';
const dd = await importTypeScriptModule('../app/fractal/double-double.ts');
const cameraMath = await importTypeScriptModule('../app/fractal/camera.ts');
const orbit = await importTypeScriptModule('../app/fractal/reference-orbit.ts');

test('double-double arithmetic retains differences below binary64 coordinate spacing',()=>{
  const point=dd.ddAdd([-.75,0],[1e-23,0]);
  assert.equal(point[0],-.75);
  assert.equal(dd.ddNumber(dd.ddSubtract(point,[-.75,0])),1e-23);
  assert.equal(dd.ddToFixed(point,26),'-0.74999999999999999999999000');
  const product=dd.ddMultiply([1,2**-53],[1,-(2**-53)]);
  assert.equal(product[0],1);
  assert.equal(product[1],-(2**-106));
  assert.equal(dd.ddToFixed([-1e-30,0],26),'0.00000000000000000000000000');
});

test('pan, selection, projection, and anchored zoom retain pixel differences at 10^20',()=>{
  const size={width:1000,height:625};
  const camera={centerRe:-.75,centerIm:.1,viewportWidth:3.6e-20};
  const panned=cameraMath.panCameraByScreenDelta(camera,{x:1,y:0},size);
  assert.equal(panned.centerRe,camera.centerRe);
  assert.ok(Math.abs(panned.centerReLow+3.6e-23)<1e-37);
  const point={x:627,y:199};
  const coordinate=cameraMath.screenToComplex(point,panned,size);
  const projected=cameraMath.complexToScreen(coordinate,panned,size);
  assert.ok(Math.abs(projected.x-point.x/size.width)<1e-12);
  assert.ok(Math.abs(projected.y-point.y/size.height)<1e-12);
  const zoomed=cameraMath.cameraForAnchoredViewportWidth(panned,point,point,size,panned.viewportWidth/2);
  const after=cameraMath.screenToComplex(point,zoomed,size);
  assert.ok(Math.abs(dd.ddNumber(dd.ddSubtract([after.re,after.reLow],[coordinate.re,coordinate.reLow])))<1e-36);
});

test('reference orbit keeps low coordinate components and exact early Mandelbrot steps',()=>{
  const reference=orbit.buildReferenceOrbit({centerRe:-2,centerReLow:1e-23,centerIm:0,viewportWidth:3.6e-20},16);
  assert.equal(reference.length,17);
  assert.equal(reference.data[4],-2);
  assert.ok(Math.abs(reference.data[6]-1e-23)<1e-30);
  assert.equal(reference.data[8],2);
  assert.ok(Math.abs(reference.data[10]+3e-23)<1e-29);
  const exterior=orbit.buildReferenceOrbit({centerRe:2,centerIm:2,viewportWidth:1},100);
  assert.ok(exterior.length<100);
});

test('reference construction yields and aborts before finishing obsolete work',async()=>{
  await assert.rejects(orbit.buildReferenceOrbitAsync({centerRe:0,centerIm:0,viewportWidth:1},4096,()=>true),error=>error.name==='AbortError');
});

test('merged approximation respects its validity radius and matches direct delta iteration',()=>{
  const reference=orbit.buildReferenceOrbit({centerRe:.1,centerIm:.1,viewportWidth:3.6e-20},512);
  const bla=reference.bla;
  assert.ok(bla);
  const m=64,block=256,index=(bla.stride+m)*4;
  assert.equal(bla.bounds[index+1],block);
  assert.ok(bla.bounds[index]>0);
  const a=[bla.high[index]+bla.low[index],bla.high[index+1]+bla.low[index+1]];
  const b=[bla.high[index+2]+bla.low[index+2],bla.high[index+3]+bla.low[index+3]];
  const dc=[1e-23,-2e-23], initial=[3e-24,4e-24];
  let delta=[...initial];
  for(let step=0;step<block;step++){
    const at=(m+step)*4,zr=reference.data[at]+reference.data[at+2],zi=reference.data[at+1]+reference.data[at+3];
    delta=[2*(zr*delta[0]-zi*delta[1])+delta[0]**2-delta[1]**2+dc[0],2*(zr*delta[1]+zi*delta[0])+2*delta[0]*delta[1]+dc[1]];
  }
  const approximation=[a[0]*initial[0]-a[1]*initial[1]+b[0]*dc[0]-b[1]*dc[1],a[0]*initial[1]+a[1]*initial[0]+b[0]*dc[1]+b[1]*dc[0]];
  assert.ok(Math.hypot(delta[0]-approximation[0],delta[1]-approximation[1])<1e-35);
});

test('scoring and displayed coordinates preserve low components',async()=>{
  const {scoreLabGuess}=await importTypeScriptModule('../app/game/score-guess.ts');
  const {formatComplex}=await importTypeScriptModule('../app/game/formatting.ts');
  const guess={re:-.75,im:.1,reLow:1e-23};
  assert.equal(scoreLabGuess(guess,{re:-.75,im:.1},1e4).coordinateDistance,1e-23);
  assert.match(formatComplex(guess,1e20),/^-0\.74999999999999999999999000/);
});

test('real-axis interior shortcut respects sub-double differences across the left tip',()=>{
  const camera={centerRe:-2,centerIm:0,viewportWidth:3.6e-20};
  assert.equal(orbit.repairOrbit(camera,1e-23,0,32768).iteration,0);
  assert.ok(orbit.repairOrbit(camera,-1e-23,0,32768).iteration>0);
});
