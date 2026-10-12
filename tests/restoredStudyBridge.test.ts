import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as bridge from '../src/restoredStudyBridge';
import { emptyForm, getMetrics } from '../src/utils';
import { generalVaultModel, formVector, predictVault } from '../src/vaultModel';
import { MEASUREMENT_VERSION } from '../src/studyMeasurements';
import type { VaultPhases, FrameAnalysis } from '../src/types';

function phases(takeoffAngle=135.123456789, takeoffTime=1.12345678, clearanceTime=2.987654321) {
  return { approachStart:null,
    takeoff:{time:takeoffTime,bodyLine:takeoffAngle},
    inversion:{time:2,inversionAngle:124.654321987},
    clearance:{time:clearanceTime} } as VaultPhases;
}
const metrics={speed:null,gripOverBar:null};

test('archived UI retains rounded values while predictor receives exact original-study values',()=>{
  const p=phases();
  const form={...bridge.measurementState(p)};
  assert.equal(form.takeoffAngle,'135');
  assert.equal(form.takeoffTime,'1.12');
  const vector=bridge.studyVector(form,3.5,metrics)!;
  assert.equal(vector.takeoffAngle,p.takeoff!.bodyLine);
  assert.equal(vector.flightTime,p.clearance!.time-p.takeoff!.time);
});

test('saving and loading rounded form values does not lose original prediction precision',()=>{
  const form=bridge.measurementState(phases());
  const saved=bridge.savedState(form);
  const loaded={...form,...JSON.parse(JSON.stringify(saved)),takeoffTime:String(Number(form.takeoffTime))};
  assert.deepEqual(bridge.studyVector(loaded,3.5,metrics),bridge.studyVector(form,3.5,metrics));
});

test('manual edits replace only that measurement, and legacy logs cannot silently use the study model',()=>{
  const form=bridge.measurementState(phases());
  const edited={...form,takeoffAngle:'120.5'};
  assert.equal(bridge.studyVector(edited,3.5,metrics)!.takeoffAngle,120.5);
  assert.equal(bridge.studyVector(edited,3.5,metrics)!.inversionAngle,form.studyInputs.raw.inversionAngle);
  assert.equal(bridge.studyVector({...edited,measurementVersion:undefined},3.5,metrics),null);
  assert.equal(bridge.studyVector({...edited,takeoffAngle:''},3.5,metrics)!.takeoffAngle,undefined);
});

test('original-study zero intervals and low takeoff angles are not rejected by the old app gate',()=>{
  const form=bridge.measurementState(phases(6,2,1));
  const vector=bridge.studyVector(form,3.5,metrics)!;
  assert.equal(vector.takeoffAngle,6);
  assert.equal(vector.flightTime,0);
  assert.equal(bridge.displayPhaseInterval(form,null),0);
  assert.equal(bridge.coachAngle(135),45);
});

test('actual generated predictor preserves all 30 original training probabilities, regardless of log count',()=>{
  const source=fs.readFileSync('restored-app/app.js','utf8');
  const start=source.indexOf('const Ci=['),end=source.indexOf('const bg=',start);
  const code=source.slice(start,end);
  const api=vm.runInNewContext(`${code}; ({model:yE, select:SE, predict:_E, vector:bE})`,{
    __study:bridge, wo:(f:any)=>Number(f.barHeight),
  });
  const data=JSON.parse(fs.readFileSync('tools/research_revision_2/statistics.json','utf8'));
  let correct=0;
  for(const row of data.rows) {
    const phase={...phases(row.takeoff_angle_deg,0,row.flight_time_s),inversion:{time:0,inversionAngle:row.inversion_angle_deg} as FrameAnalysis};
    const form={...emptyForm(),barHeight:String(row.bar_height_m),unit:'m' as const,...bridge.measurementState(phase)};
    const model=api.select(Array.from({length:40},()=>({result:'make'})));
    assert.equal(model.source,'general');
    const result=api.predict(model,api.vector(form,metrics));
    assert.ok(Math.abs(result.probability-row.training_probability)<1e-12);
    if((result.probability>=.5)===Boolean(row.y)) correct++;
  }
  assert.equal(correct,20);
});
