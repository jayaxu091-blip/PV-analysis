import ts from 'typescript';

// Move the original expressions intact. Do not recreate or restyle the panels.
export function separateOriginalPages(source) {
  const tree=ts.createSourceFile('original.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const app=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='EE');
  if(!app) throw new Error('Original app function missing');
  const prop=(call,name)=>call.arguments[1]?.properties?.find(p=>p.name?.getText(tree)===name)?.initializer;
  const children=call=>prop(call,'children');
  const tag=call=>call?.arguments?.[0]?.getText(tree);
  const calls=[];
  function visit(n){if(ts.isCallExpression(n)&&/^_\.jsxs?$/.test(n.expression.getText(tree)))calls.push(n);ts.forEachChild(n,visit);}
  visit(app);
  const main=calls.find(n=>tag(n)==='"main"'&&children(n)&&prop(children(n),'className')?.getText(tree)==='"layout"');
  if(!main) throw new Error('Original logged-in layout missing');
  const layout=children(main),columns=children(layout)?.elements;
  if(columns?.length!==2) throw new Error('Original two-column layout changed');
  const [shell,aside]=columns,panels=children(shell)?.elements;
  if(panels?.length!==3||tag(aside)!=='"aside"') throw new Error('Original panel layout changed');
  const [video,model,log]=panels;
  if(!video.getText(tree).includes('Attempt Video')||!log.getText(tree).includes('Attempt Log'))throw new Error('Original panel headings changed');
  const pieces={video:video.getText(tree),model:model.getText(tree),log:log.getText(tree),details:aside.getText(tree)};
  const measuredLabels=new Map([
    ['Approach time in seconds','Approach time (s)'],
    ['Takeoff angle from AI','Takeoff angle (°)'],
    ['Inversion angle from AI','Inversion angle (°)'],
    ['Takeoff time from video AI','Takeoff time (s)'],
    ['Clearance time from video AI','Clearance time (s)'],
  ]);
  const grids=[];
  function findGrid(n){if(ts.isCallExpression(n)&&prop(n,'className')?.getText(tree)==='"grid"')grids.push(n);ts.forEachChild(n,findGrid);}
  findGrid(aside);
  if(grids.length!==1)throw new Error('Expected the original jump-details grid');
  const grid=grids[0],fields=children(grid)?.elements;
  if(!fields)throw new Error('Jump-details fields missing');
  const entered=[],measured=[];
  for(const field of fields){
    const label=prop(field,'label');
    if(label&&ts.isStringLiteral(label)&&measuredLabels.has(label.text)){
      const offset=label.getStart(tree)-field.getStart(tree),text=field.getText(tree);
      measured.push(text.slice(0,offset)+JSON.stringify(measuredLabels.get(label.text))+text.slice(offset+label.getWidth(tree)));
    }else entered.push(field.getText(tree));
  }
  if(measured.length!==5)throw new Error('Expected all five pose measurement fields');
  const grouped=`_.jsxs(_.Fragment,{children:[_.jsxs("div",{className:"grid",children:[${entered.join(',')}]}),_.jsxs("fieldset",{className:"pose-results-group",children:[_.jsx("legend",{children:"Pose estimation results"}),_.jsxs("div",{className:"grid",children:[${measured.join(',')}]})]})]})`;
  const detailSection=children(aside),detailChildren=children(detailSection);
  const metrics=detailChildren?.elements?.find(n=>prop(n,'className')?.getText(tree)==='"metric-grid"');
  const feedback=detailChildren?.elements?.find(n=>prop(n,'className')?.getText(tree)==='"coach-panel"');
  if(!metrics||!feedback)throw new Error('Original metrics or coach feedback missing');
  pieces.metrics=metrics.getText(tree);
  pieces.feedback=feedback.getText(tree);
  const formChildren=detailChildren.elements.filter(n=>n!==metrics&&n!==feedback).map(n=>n.getText(tree));
  const formSection=detailSection.getText(tree).replace(detailChildren.getText(tree),`[${formChildren.join(',')}]`).replace(grid.getText(tree),grouped);
  pieces.details=`_.jsx("aside",{children:${formSection}})`;
  pieces.summary=`_.jsxs("section",{"aria-label":"Jump summary and coaching feedback",children:[_.jsx("h2",{children:"Jump summary"}),${pieces.metrics},${pieces.feedback}]})`;
  const ids=['jump','summary','model','log'],labels=['Jump analysis','Jump summary','Logistic model','Attempt Log'];
  const buttons=ids.map((id,index)=>`_.jsx("button",{type:"button",className:__vaultPage===${JSON.stringify(id)}?"":"secondary","aria-current":__vaultPage===${JSON.stringify(id)}?"page":undefined,onClick:()=>__vaultNavigate(${JSON.stringify(id)}),children:${JSON.stringify(labels[index])}})`).join(',');
  const navigation=`_.jsxs("nav",{className:"three-page-navigation","aria-label":"Main navigation",children:[${buttons}]})`;
  const first=`_.jsx("div",{hidden:__vaultPage!=="jump",className:"original-page",children:_.jsxs("div",{className:"layout",children:[_.jsx("div",{className:"video-shell",children:${pieces.video}}),${pieces.details}]})})`;
  // Give the standalone model and log more space, keeping their contents intact.
  const other=(id,panel)=>`_.jsx("div",{hidden:__vaultPage!=="${id}",className:"original-page",children:_.jsx("div",{className:"standalone-panel-layout",children:_.jsx("div",{className:"video-shell",children:${panel}})})})`;
  const replacement=`_.jsxs("main",{children:[${navigation},${first},${other('summary',pieces.summary)},${other('model',pieces.model)},${other('log',pieces.log)}]})`;
  const hooks=`const [__vaultPage,__vaultSetPage]=me.useState(()=>__vaultReadPage());function __vaultReadPage(){const p=window.location.hash.slice(1);return ${JSON.stringify(ids)}.includes(p)?p:"jump";}function __vaultNavigate(p){__vaultSetPage(p);window.location.hash=p;}me.useEffect(()=>{const changed=()=>__vaultSetPage(__vaultReadPage());window.addEventListener("hashchange",changed);return()=>window.removeEventListener("hashchange",changed);},[]);me.useEffect(()=>{if(__vaultPage!=="jump"){l.current?.pause();}else{const request=window.requestAnimationFrame(()=>fa());return()=>window.cancelAnimationFrame(request);}},[__vaultPage]);`;
  const load=app.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Ba');
  if(!load) throw new Error('Original load-attempt handler missing');
  const edits=[{start:main.getStart(tree),end:main.end,text:replacement},{start:app.body.getStart(tree)+1,end:app.body.getStart(tree)+1,text:hooks},{start:load.body.getStart(tree)+1,end:load.body.getStart(tree)+1,text:'__vaultNavigate("jump");'}];
  let generated=source;
  for(const e of edits.sort((a,b)=>b.start-a.start))generated=generated.slice(0,e.start)+e.text+generated.slice(e.end);
  for(const [name,expression] of Object.entries(pieces))if(!generated.includes(expression))throw new Error(`${name} panel was modified`);
  return {code:generated,audit:{pageCount:4,originalPanelExpressionsPreserved:['video','model','log','metrics','feedback'],jumpDetailsChange:'Grouped the five pose fields with unit labels; moved summary metrics and coaching feedback to the summary page; value bindings and handlers preserved',originalHeaderPreserved:true,originalStylesheetPreserved:true,videoStaysMounted:true}};
}
