// Suggested bead density, not source pixel dimensions. Keep board/color choices.
export function imageSizing(image, previous, keep=false) {
  if(!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width<1 || image.height<1)throw Error('Invalid source dimensions');
  if(keep)return {...previous};
  return {...previous,width:Math.max(8,Math.min(128,Math.round(48*image.width/Math.max(image.width,image.height)))),crop:'original'};
}
