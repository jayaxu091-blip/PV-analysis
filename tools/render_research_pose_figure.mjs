import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const runtimeRequire=createRequire('C:/Users/jayax/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=runtimeRequire('playwright');
const root=process.cwd();
const out=path.join(root,'tools','research_revision_2');
fs.mkdirSync(out,{recursive:true});
const filename='5.4 meters, miss.mp4';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.setContent('<input type="file" id="file"><video id="video" muted></video>');
  await page.locator('#file').setInputFiles(path.join(root,'pole vault videos miss and makes',filename));
  const results=await page.evaluate(async()=>{
    const video=document.querySelector('video');
    const loaded=new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
    video.src=URL.createObjectURL(document.querySelector('input').files[0]);
    await loaded;
    const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm');
    const resolver=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
    const model=await vision.PoseLandmarker.createFromOptions(resolver,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',delegate:'CPU'},
      runningMode:'VIDEO',numPoses:1});
    const frames=[];
    for(const [i,time] of [3.0,3.9,4.6,5.2].entries()){
      await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
      const landmarks=model.detectForVideo(video,(i+1)*33).landmarks?.[0]||[];
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const c=canvas.getContext('2d');c.drawImage(video,0,0);
      const plain=canvas.toDataURL('image/png');
      const visible=p=>p&&(p.visibility===undefined||p.visibility>.45);
      c.lineWidth=5;c.strokeStyle='#00f5e1';
      for(const {start,end} of vision.PoseLandmarker.POSE_CONNECTIONS){
        const a=landmarks[start],b=landmarks[end];if(!visible(a)||!visible(b))continue;
        c.beginPath();c.moveTo(a.x*canvas.width,a.y*canvas.height);c.lineTo(b.x*canvas.width,b.y*canvas.height);c.stroke();
      }
      for(const p of landmarks){if(!visible(p))continue;c.beginPath();c.arc(p.x*canvas.width,p.y*canvas.height,6,0,Math.PI*2);c.fillStyle='#ffeb3b';c.fill();c.lineWidth=2;c.strokeStyle='#161616';c.stroke();}
      frames.push({time,width:canvas.width,height:canvas.height,landmarks,plain,overlay:canvas.toDataURL('image/png')});
    }
    model.close();return frames;
  });
  const metadata=[];
  for(const [i,r] of results.entries()){
    for(const type of ['plain','overlay'])fs.writeFileSync(path.join(out,`pose-${i}-${type}.png`),Buffer.from(r[type].split(',')[1],'base64'));
    metadata.push({file:filename,time:r.time,width:r.width,height:r.height,landmarks:r.landmarks});
  }
  fs.writeFileSync(path.join(out,'illustrative_pose_frames.json'),JSON.stringify(metadata,null,2));
  console.log(JSON.stringify(metadata.map(r=>({file:r.file,time:r.time,points:r.landmarks.length}))));
}finally{await browser.close();}
