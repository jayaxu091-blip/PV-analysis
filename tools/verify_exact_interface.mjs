import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire('C:/Users/jayax/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright'),{PNG}=require('pngjs');
const root=process.cwd(),out=path.join(root,'output/exact_interface_qa');
fs.mkdirSync(out,{recursive:true});
const css=fs.readFileSync('restored-app/assets/index-Cj98egCU.css');
if(!css.equals(fs.readFileSync('dist/assets/index-Cj98egCU.css'))) throw new Error('Built CSS is not byte-identical');
const beforeHtml='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>VaultLab</title><link rel="stylesheet" href="/assets/index-Cj98egCU.css"></head><body><div id="root"></div><script type="module" src="/baseline.js"></script></body></html>';
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let file;
  if(url.pathname==='/baseline.js') file='restored-app/baseline/app.original.js';
  else if(url.pathname==='/before') {res.writeHead(200,{'Content-Type':'text/html'});res.end(beforeHtml);return;}
  else if(url.pathname.startsWith('/assets/')&&!url.pathname.includes('..')) file='dist'+url.pathname;
  else file='dist/index.html';
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
  res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const base=`http://127.0.0.1:${server.address().port}`;
const report={stylesheetIdentical:true,screenshots:[],video:null};
try {
  for(const [name,viewport] of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]) {
    const images=[];
    for(const version of ['before','after']) {
      const context=await browser.newContext({viewport,deviceScaleFactor:1});
      const page=await context.newPage();
      await page.goto(base+'/'+version);
      await page.getByRole('button',{name:'Try demo without account'}).click();
      await page.getByRole('button',{name:'Analyze full video',exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:path.join(out,`${name}-${version}.png`),fullPage:true,animations:'disabled'});
      images.push(PNG.sync.read(fs.readFileSync(path.join(out,`${name}-${version}.png`))));
      await context.close();
    }
    let changed=0;
    if(images[0].width!==images[1].width||images[0].height!==images[1].height) throw new Error(`${name}: page dimensions changed`);
    for(let i=0;i<images[0].data.length;i+=4) if(images[0].data.subarray(i,i+4).compare(images[1].data.subarray(i,i+4))) changed++;
    report.screenshots.push({name,width:images[0].width,height:images[0].height,changedPixels:changed});
    console.log(`${name}: ${changed} changed pixels`);
    if(changed) throw new Error(`${name}: interface differs`);
  }
  const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/after');
  await page.getByRole('button',{name:'Try demo without account'}).click();
  await page.locator('input[type=file]').setInputFiles(path.join(root,'pole vault videos miss and makes/11 feet 6 inches, make.mp4'));
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2;});
  await page.getByLabel('Athlete',{exact:true}).fill('QA test');
  await page.getByLabel('Bar height',{exact:true}).fill('3.5052');
  await page.getByLabel(/^Bar unit/).selectOption('m');
  await page.getByLabel(/^Result/).selectOption('make');
  await page.getByRole('button',{name:'Analyze full video',exact:true}).click();
  await page.getByText(/Auto analysis complete:/).waitFor({timeout:180000});
  const state=await page.evaluate(()=>({text:document.body.innerText,fields:[...document.querySelectorAll('label')].filter(e=>e.querySelector('input')).map(e=>({label:e.textContent,value:e.querySelector('input').value}))}));
  console.log(state.text.slice(-3700));
  // Preserve proof that this real-video run passes through the hidden full-precision bridge.
  await page.getByRole('button',{name:'Save attempt',exact:true}).click();
  await page.waitForFunction(()=>Object.values(localStorage).some(s=>{
    try {const rows=JSON.parse(s);return Array.isArray(rows)&&rows[0]?.athlete==='QA test';}catch{return false;}
  }));
  const stored=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('vault'))));
  const attempt=Object.values(stored).map(s=>{try{return JSON.parse(s)}catch{return null}}).find(v=>Array.isArray(v)&&v[0]?.athlete==='QA test')?.[0];
  if(attempt?.measurementVersion!=='study-normalized-v1'||!attempt.studyInputs) throw new Error('Saved log lacks study provenance');
  const probability=await page.locator('.prediction-panel .metric strong').first().textContent();
  await page.getByRole('button',{name:'New attempt',exact:true}).click();
  if(await page.locator('.prediction-panel .metric strong').first().textContent()!=='--') throw new Error('New attempt retained prediction');
  await page.getByRole('button',{name:'Load',exact:true}).click();
  await page.waitForFunction(expected=>document.querySelector('.prediction-panel .metric strong')?.textContent===expected,probability);
  report.video={clip:'11 feet 6 inches, make.mp4',fields:state.fields,attempt,saveLoadProbability:probability,errors};
  await page.screenshot({path:path.join(out,'desktop-analyzed.png'),fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  await context.close();
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();await new Promise(r=>server.close(r));
}
