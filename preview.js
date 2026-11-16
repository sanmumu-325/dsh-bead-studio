// Native SVG elements: text and paths stay vector at every zoom and display density.
export function createPreview(React) {
  const h=React.createElement;
  return function Preview({pattern,boardId,labels,grid,fit,zoom,highlight='',t,strokePreview=null}) {
    const b=pattern.boards.find(b=>b.id===boardId)||{x:0,y:0,width:pattern.width,height:pattern.height};
    const s=32,m=32,w=b.width*s+m*2,height=b.height*s+m*2;
    const nodes=React.useMemo(()=>{
      const output=[h('rect',{key:'paper',width:w,height,fill:'#ffffff'})];
      const text=(key,x,y,value,fill='#333333',size=11)=>h('text',{key,x,y,fill,fontSize:size,fontFamily:'Arial, sans-serif',textAnchor:'middle',dominantBaseline:'central'},value);
      for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
        const p=pattern.palette[pattern.cells[(b.y+y)*pattern.width+b.x+x]],xx=m+x*s,yy=m+y*s,key=`${x}:${y}`;
        if(p){
          const cell=[h('rect',{key:'c'+key,x:xx,y:yy,width:s,height:s,fill:p.hex,shapeRendering:'crispEdges'})];
          if(labels){const [r,g,blue]=p.rgb;cell.push(text('t'+key,xx+s/2,yy+s/2,p.id,r*.299+g*.587+blue*.114>145?'#111111':'#ffffff'));}
          output.push(h('g',{key:'cell'+key,opacity:highlight && p.id!==highlight ? .18 : 1,'data-color-id':p.id},cell));
        }else output.push(h('circle',{key:'e'+key,cx:xx+s/2,cy:yy+s/2,r:1,fill:'#bbbbbb'}));
      }
      if(grid){
        for(let x=0;x<=b.width;x++)output.push(h('path',{key:'vx'+x,d:`M${m+x*s} ${m}v${b.height*s}`,stroke:(b.x+x)%pattern.boardSize===0?'#222222':'#999999',strokeWidth:(b.x+x)%pattern.boardSize===0?2:((b.x+x)%5===0?1:.5),fill:'none'}));
        for(let y=0;y<=b.height;y++)output.push(h('path',{key:'hy'+y,d:`M${m} ${m+y*s}h${b.width*s}`,stroke:(b.y+y)%pattern.boardSize===0?'#222222':'#999999',strokeWidth:(b.y+y)%pattern.boardSize===0?2:((b.y+y)%5===0?1:.5),fill:'none'}));
      }
      for(let x=0;x<b.width;x++)output.push(text('col'+x,m+x*s+s/2,m/2,String(b.x+x+1)));
      for(let y=0;y<b.height;y++)output.push(text('row'+y,m/2,m+y*s+s/2,String(b.y+y+1)));
      return output;
    },[pattern,boardId,labels,grid,highlight]);
    // This transient SVG layer never enters pattern, counts, history or exports.
    const draft=[];
    if(strokePreview){
      const color=pattern.palette.find(p=>p.id===strokePreview.colorId),erase=strokePreview.erase;
      if(erase||color)for(const index of strokePreview.indices){
        const x=index%pattern.width-b.x,y=Math.floor(index/pattern.width)-b.y;
        if(x<0||y<0||x>=b.width||y>=b.height)continue;
        const xx=m+x*s,yy=m+y*s;
        draft.push(h('g',{key:index,'data-draft-index':index},
          h('rect',{x:xx,y:yy,width:s,height:s,fill:erase?'#ffffff':color.hex,shapeRendering:'crispEdges'}),
          erase?h('circle',{cx:xx+s/2,cy:yy+s/2,r:1,fill:'#bbbbbb'}):labels?h('text',{x:xx+s/2,y:yy+s/2,fill:color.rgb[0]*.299+color.rgb[1]*.587+color.rgb[2]*.114>145?'#111111':'#ffffff',fontSize:11,fontFamily:'Arial, sans-serif',textAnchor:'middle',dominantBaseline:'central'},color.id):null));
      }
    }
    const overlay=draft.length?h('g',{key:'stroke-preview','data-stroke-preview':strokePreview.erase?'erase':'paint',pointerEvents:'none',style:{pointerEvents:'none'},'aria-hidden':true},draft):null;
    return h('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`0 0 ${w} ${height}`,width:fit?'100%':w*zoom/100,height:fit?undefined:height*zoom/100,style:{display:'block',flexShrink:0,width:fit?'100%':w*zoom/100,height:fit?'auto':height*zoom/100,maxWidth:'none',background:'#ffffff'},role:'img','aria-label':t('previewAria'),'data-preview-kind':'vector','data-zoom':fit?'fit':zoom},overlay?[...nodes.slice(0,1+b.width*b.height),overlay,...nodes.slice(1+b.width*b.height)]:nodes);
  };
}
