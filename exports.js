export function exportFilename(name,pattern,boardId='') {
  const stem=String(name||'bead').replace(/\.[a-zA-Z0-9]{1,6}$/,'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,60)||'bead';
  return `${stem}-${pattern.width}x${pattern.height}${boardId?'-'+boardId:''}`;
}
export async function prepareExport(core,kind,{pattern,view,name,project}) {
  const filename=exportFilename(name,pattern,['png','svg'].includes(kind)?view.boardId:'');
  let data,type,extension=kind;
  const svg=()=>core.toSvg(pattern,{boardId:view.boardId||null,labels:view.labels,grid:view.grid,cellSize:32});
  if(kind==='svg'){data=svg();type='image/svg+xml';}
  else if(kind==='csv'){data='\uFEFF'+core.toCsv(pattern);type='text/csv;charset=utf-8';}
  else if(kind==='json'){data=JSON.stringify(project,null,2);type='application/json';}
  else if(kind==='pdf'){data=core.toPdf(pattern);type='application/pdf';}
  else if(kind==='png'){
    const url=URL.createObjectURL(new Blob([svg()],{type:'image/svg+xml'}));
    try{const image=new Image();image.src=url;await image.decode();if(image.width*image.height>25000000)throw new Error('Image exceeds 25 MP; select one board or use SVG.');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);data=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!data)throw new Error('PNG encoding failed.');type='image/png';}finally{URL.revokeObjectURL(url);}
  }else throw new Error('Unsupported export format.');
  return {blob:data instanceof Blob?data:new Blob([data],{type}),filename:filename+(kind==='pdf'?'-boards':kind==='csv'?'-materials':'')+'.'+extension,type};
}
