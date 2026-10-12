import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root=process.cwd(), target=path.join(root,'restored-app');
fs.mkdirSync(path.join(target,'baseline'),{recursive:true});
fs.mkdirSync(path.join(target,'assets'),{recursive:true});
const baseline=path.join(target,'baseline/app.original.js');
if(!fs.existsSync(baseline)) fs.copyFileSync('output/research_restored_20260913/published-index-DHztDhVJ.js',baseline);
const source=fs.readFileSync(baseline,'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const regionalUpdateCss = `.regional-update {
  background: #10231f;
  border-bottom: 4px solid #d99d25;
  color: #ffffff;
}

.regional-update__inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.regional-update__eyebrow,
.regional-update__date span {
  color: #9fd8cf;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.regional-update h2 {
  margin: 2px 0 4px;
  color: #ffffff;
  font-size: 22px;
  line-height: 1.2;
}

.regional-update p {
  margin: 0;
  max-width: 720px;
  color: #d7eee8;
  font-size: 14px;
  line-height: 1.45;
}

.regional-update__date {
  flex: 0 0 auto;
  min-width: 168px;
  padding: 10px 13px;
  border: 1px solid rgba(159, 216, 207, 0.32);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.regional-update__date strong {
  display: block;
  margin: 2px 0;
  color: #ffffff;
  font-size: 26px;
  line-height: 1;
}

@media (max-width: 720px) {
  .regional-update__inner {
    align-items: stretch;
    flex-direction: column;
  }

  .regional-update__date {
    width: 100%;
  }
}
`;
const regionalUpdateHtml = `<aside class="regional-update" aria-label="Regional final update">
  <div class="regional-update__inner">
    <div>
      <span class="regional-update__eyebrow">Regional final update</span>
      <h2>First place at the regional final</h2>
      <p>VaultLab earned first place and will be presented live in Philadelphia on October 31, 2026.</p>
    </div>
    <div class="regional-update__date" aria-label="Live presentation date">
      <span>Live presentation</span>
      <strong>Oct. 31</strong>
      <span>Philadelphia</span>
    </div>
  </div>
</aside>`;
if(hash(source)!=='a8c4535ad9e0c7b96f1689f37b21137414d5f5a4b829af36b68174a901a79929') throw new Error('Original interface checksum mismatch');
const tree=ts.createSourceFile('original.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];
function findFunction(name,owner=null) {
  const hits=[];
  function visit(node) {
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name) {
      const parent=ts.isBlock(node.parent)&&ts.isFunctionDeclaration(node.parent.parent)?node.parent.parent.name?.text:null;
      if(parent===owner) hits.push(node);
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  if(hits.length!==1) throw new Error(`Expected one ${owner||'global'}.${name}, found ${hits.length}`);
  return hits[0];
}
function patch(name,replacement,owner=null) {
  const n=findFunction(name,owner), old=source.slice(n.getStart(tree),n.end);
  const next=typeof replacement==='function'?replacement(old):replacement;
  edits.push({name,owner,start:n.getStart(tree),end:n.end,old,next});
}
function once(text,old,next) {
  if(text.split(old).length!==2) throw new Error(`Expected unique data expression: ${old}`);
  return text.replace(old,next);
}
patch('bp','function bp(l,i){return __study.lineAngle(l,i)}');
patch('gE','function gE(l){return __study.phasesForInterface(l)}');
patch('pE','async function pE(l,i){return __study.analyzeVideoFrames(l,i)}');
patch('go','function go(l,i){return __study.seekVideo(l,i)}');
patch('SE','function SE(l){return yE}');
patch('bE','function bE(l,i){return __study.studyVector(l,wo(l),i)}');
patch('Q_',s=>once(s,'flightTime:f!==null&&h!==null&&h>f?h-f:null','flightTime:__study.displayPhaseInterval(l,f!==null&&h!==null&&h>f?h-f:null)'));
patch('Z_',s=>once(s,'c=Ye(l.takeoffAngle)','c=__study.coachAngle(l.takeoffAngle)'));
patch('I',s=>once(s,'ct([])','ct([]),Q(current=>({...current,measurementVersion:undefined,studyInputs:undefined}))'),'EE');
patch('Ne',s=>{
  s=once(s,'O.pause(),Qe','O.pause(),Q(current=>({...current,measurementVersion:undefined,studyInputs:undefined})),Qe');
  s=once(s,'&&P.takeoff.bodyLine>=25','');
  s=once(s,';Q(Nn),ut', ';Object.assign(Nn,__study.measurementState(P));Q(Nn),ut');
  return s;
},'EE');
patch('oa',s=>once(s,'notes:x.notes.trim()','notes:x.notes.trim(),...__study.savedState(x)'),'EE');
patch('Ba',s=>once(s,'I(),Q({athlete:', 'I(),Q({measurementVersion:O.measurementVersion,studyInputs:O.studyInputs,athlete:'),'EE');

// Generated changes are confined to the listed calculation/state functions.
let generated=source;
for(const e of [...edits].sort((a,b)=>b.start-a.start)) generated=generated.slice(0,e.start)+e.next+generated.slice(e.end);
const parsed=ts.createSourceFile('patched.js',generated,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(parsed.parseDiagnostics.length) throw new Error('Patched interface failed JavaScript parsing');
function renderCalls(tree,text) {
  const calls=[];
  function visit(n) {
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(tree)==='_'&&['jsx','jsxs'].includes(n.expression.name.text)) calls.push(n.getText(tree));
    ts.forEachChild(n,visit);
  }
  visit(tree);return calls;
}
const before=renderCalls(tree,source),after=renderCalls(parsed,generated);
if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error('Interface render code changed');
fs.writeFileSync(path.join(target,'app.js'),'import * as __study from "../src/restoredStudyBridge.ts";\n'+generated);
const cssPath=path.join(target,'assets/index-Cj98egCU.css');
if(!fs.existsSync(cssPath)) {
  const response=await fetch('https://pvanalysis-68252.web.app/assets/index-Cj98egCU.css');
  if(!response.ok) throw new Error('Cannot retrieve original stylesheet');
  fs.writeFileSync(cssPath,Buffer.from(await response.arrayBuffer()));
}
if(hash(fs.readFileSync(cssPath))!=='33bb2c7a2c5f27a834b01fe2e8f9c64e934c21b182115e1d62bc95da803bdbff') throw new Error('Original stylesheet checksum mismatch');
fs.writeFileSync(path.join(target,'assets/regional-update.css'),regionalUpdateCss);
fs.writeFileSync(path.join(target,'index.html'),`<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>VaultLab</title><link rel="stylesheet" href="/assets/index-Cj98egCU.css"/><link rel="stylesheet" href="/assets/regional-update.css"/></head><body>${regionalUpdateHtml}<div id="root"></div><script type="module" src="/app.js"></script></body></html>
`);
fs.writeFileSync(path.join(target,'baseline/verification.json'),JSON.stringify({originalSha256:hash(source),cssSha256:hash(fs.readFileSync(cssPath)),jsxCallsUnchanged:before.length,changedFunctions:edits.map(({name,owner})=>({name,owner})),generatedSha256:hash(generated)},null,2));
console.log(`Preserved all ${before.length} interface render expressions and original CSS. Adapted ${edits.length} internal functions.`);
