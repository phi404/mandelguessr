export type BilinearApproximation = {
  high: Float32Array;
  low: Float32Array;
  bounds: Float32Array;
  stride: number;
  maxDelta: number;
};

/** Merge z -> A*z+B*c steps with a conservative validity radius.
 * See https://mathr.co.uk/web/deep-zoom.html . */
export function buildBilinearApproximation(orbit: Float32Array, length: number, viewportWidth: number): BilinearApproximation {
  const stride = Math.ceil(length / 1024) * 1024;
  const result: BilinearApproximation = { high: new Float32Array(stride*8), low: new Float32Array(stride*8),
    bounds: new Float32Array(stride*8), stride, maxDelta: viewportWidth*8 };
  // Each working row contains complex A, complex B, and the radius.
  let previous = new Float64Array(length*5);
  for(let m=1;m<length-1;m++) {
    const re=orbit[m*4]+orbit[m*4+2], im=orbit[m*4+1]+orbit[m*4+3];
    previous[m*5]=2*re; previous[m*5+1]=2*im; previous[m*5+2]=1;
    const nextRe=orbit[(m+1)*4], nextIm=orbit[(m+1)*4+1];
    previous[m*5+4]=Math.hypot(nextRe,nextIm)<90 ? 1e-13*Math.hypot(2*re,2*im) : 0;
  }
  for(let half=1;half<256;half*=2) {
    const merged = new Float64Array(length*5);
    const block=half*2;
    for(let m=1;m+block<length;m++) {
      const x=m*5,y=(m+half)*5;
      const ar=previous[x],ai=previous[x+1],br=previous[x+2],bi=previous[x+3];
      const cr=previous[y],ci=previous[y+1],dr=previous[y+2],di=previous[y+3];
      merged[x]=cr*ar-ci*ai;
      merged[x+1]=cr*ai+ci*ar;
      merged[x+2]=cr*br-ci*bi+dr;
      merged[x+3]=cr*bi+ci*br+di;
      const magnitude=Math.hypot(ar,ai);
      merged[x+4]=magnitude>0 ? Math.max(0,Math.min(previous[x+4],(previous[y+4]-Math.hypot(br,bi)*result.maxDelta)/magnitude)) : 0;
      if(block===16 || block===256) {
        const offset=((block===16 ? 0 : stride)+m)*4;
        const valid=merged[x+4]>0 && merged.subarray(x,x+4).every(value=>Number.isFinite(value)&&Math.abs(value)<1e30);
        if(!valid)continue;
        for(let channel=0;channel<4;channel++) {
          const high=Math.fround(merged[x+channel]);
          result.high[offset+channel]=high;
          result.low[offset+channel]=merged[x+channel]-high;
        }
        // Leave room for packing and arithmetic error at the validity boundary.
        result.bounds[offset]=merged[x+4]*0.25;
        result.bounds[offset+1]=block;
      }
    }
    previous=merged;
  }
  return result;
}
