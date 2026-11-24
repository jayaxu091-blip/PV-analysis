import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import test from 'node:test';

test('actual restored login renders providers, opens email, and keeps demo and Google handlers', async () => {
  const code=fs.readFileSync('restored-app/app.js','utf8');
  const ast=ts.createSourceFile('app.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const auth=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AE');
  assert.ok(auth,'The generated login function must exist');
  const states=[];let cursor=0,googleCalls=0,demoCalls=0;
  const jsx=(type,props)=>{assert.notEqual(type,undefined,'Every JSX type, including Fragment, must be bound');return typeof type==='function'?type(props):{type,props:props??{}};};
  const render=vm.runInNewContext(`(${auth.getText(ast)})`,{
    _: {jsx,jsxs:jsx,Fragment:Symbol('Fragment')},
    me:{useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=value;}];}},
    __VaultLabLogo:'/logo.png',Ui:{},W_:{},QS:async()=>{googleCalls++;},ES:async()=>{},_S:async()=>{},Eg:String,
  });
  const collect=(root)=>{const all=[];function visit(n){if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;all.push(n);visit(n.props?.children);}visit(root);return all;};
  const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
  const draw=()=>{cursor=0;return render({onDemo:()=>{demoCalls++;}});};
  let nodes=collect(draw());
  assert.ok(nodes.some(n=>n.type==='main'&&n.props.className==='login-page'));
  assert.ok(nodes.some(n=>n.type==='img'&&n.props.src==='/logo.png'));
  assert.ok(!nodes.some(n=>text(n).includes('Continue with Apple')));
  await nodes.find(n=>n.type==='button'&&text(n)==='Continue with Google').props.onClick();
  assert.equal(googleCalls,1);
  nodes.find(n=>n.type==='button'&&text(n)==='Explore the demo').props.onClick();
  assert.equal(demoCalls,1);
  nodes.find(n=>n.type==='button'&&text(n)==='Continue with Email').props.onClick();
  nodes=collect(draw());
  assert.ok(nodes.some(n=>n.type==='input'&&n.props.type==='email'));
  assert.ok(nodes.some(n=>n.type==='input'&&n.props.type==='password'));
  nodes.find(n=>n.type==='button'&&text(n)==='← All sign-in options').props.onClick();
  nodes=collect(draw());
  assert.ok(nodes.some(n=>n.type==='button'&&text(n)==='Continue with Google'));
});
