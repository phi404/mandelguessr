import { doubleSingleFunctions, sharedColorFunctions } from "./mandelbrot-shaders";
import { MANDELBROT_MAX_ITERATIONS } from "./mandelbrot-domain";

/** The same iteration body is used for resumable tiles and synchronous exports. */
export function iterationShaderSource(resumable: boolean) {
  return `#version 300 es
precision highp float;
precision highp int;
${resumable ? `layout(location=0) out vec4 outState;
layout(location=1) out vec4 outMeta;
uniform sampler2D u_state;
uniform sampler2D u_meta;
uniform bool u_initial;` : "out vec4 outColor;"}
uniform bool u_perturb;
uniform sampler2D u_reference;
uniform int u_referenceLength;
uniform vec2 u_referenceOffset;
uniform vec2 u_referenceOffsetLow;
uniform vec2 u_centerHigh;
uniform vec2 u_centerLow;
uniform vec2 u_pixelStep;
uniform vec2 u_outputSize;
uniform vec2 u_tileOrigin;
uniform int u_completed;
uniform int u_steps;
uniform sampler2D u_blaHigh;
uniform sampler2D u_blaLow;
uniform sampler2D u_blaBounds;
uniform bool u_blaEnabled;
uniform int u_blaStride;
// Log-log escape coloring tolerates small orbit-space error.
const float ERROR_TOLERANCE = 0.01;
${sharedColorFunctions}
${doubleSingleFunctions}

vec4 referenceAt(int index) {
  return texelFetch(u_reference, ivec2(index % 1024, index / 1024), 0);
}

float safeLength(vec2 value) {
  float scale=max(abs(value.x),abs(value.y));
  return scale>0.0 ? scale*length(value/scale) : 0.0;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec2 pixelOffset = u_tileOrigin + gl_FragCoord.xy - 0.5*u_outputSize;
  vec2 offsetX = dsMultiply(vec2(pixelOffset.x,0.0),u_pixelStep);
  vec2 offsetY = dsMultiply(vec2(pixelOffset.y,0.0),u_pixelStep);
  vec2 cX = dsAdd(vec2(u_centerHigh.x,u_centerLow.x),offsetX);
  vec2 cY = dsAdd(vec2(u_centerHigh.y,u_centerLow.y),offsetY);
  vec2 dcX = dsAdd(vec2(u_referenceOffset.x,u_referenceOffsetLow.x),offsetX);
  vec2 dcY = dsAdd(vec2(u_referenceOffset.y,u_referenceOffsetLow.y),offsetY);
  vec4 state = vec4(0.0);
  // Reference index, escape iteration, active error / escaped magnitude, status.
  // status: 0 = active, 1 = requires CPU repair, 2 = known interior.
  vec4 meta = vec4(0.0);
  ${resumable ? `if (!u_initial) {
    state = texelFetch(u_state, pixel, 0);
    meta = texelFetch(u_meta, pixel, 0);
  }` : ""}
  vec2 c = vec2(cX.x, cY.x);
  float x = c.x - 0.25;
  float q = x*x + c.y*c.y;
  // A margin keeps the float32 shortcut away from the actual boundary.
  bool realSegment=cY.x==0.0 && cY.y==0.0 &&
    (cX.x>-2.0 || (cX.x==-2.0 && cX.y>=0.0)) &&
    (cX.x<0.25 || (cX.x==0.25 && cX.y<=0.0));
  if (realSegment || q*(q+x) < 0.25*c.y*c.y - 0.00001 || dot(c+vec2(1.0,0.0), c+vec2(1.0,0.0)) < 0.06249) meta.w = 2.0;

  if (meta.y == 0.0 && meta.w == 0.0) {
    int m = int(meta.x);
    int consumed = 0;
    float errorBound=meta.z;
    float magnitudeSquared=0.0;
    for (int i = 0; i < ${resumable ? 1024 : MANDELBROT_MAX_ITERATIONS}; i++) {
      if (consumed >= u_steps) break;
      if (u_perturb) {
        vec2 dx=state.xy, dy=state.zw;
        if (m >= u_referenceLength-1) {
          vec4 last=referenceAt(m);
          dx=dsAdd(dx,last.xz); dy=dsAdd(dy,last.yw);
          m=0;
        }
        bool skipped=false;
        if(u_blaEnabled && m>0) {
          for(int level=1;level>=0;level--) {
            int index=level*u_blaStride+m;
            ivec2 texel=ivec2(index%1024,index/1024);
            vec2 bound=texelFetch(u_blaBounds,texel,0).xy;
            int block=int(bound.y);
            if(block>0 && block<=u_steps-consumed && max(abs(dx.x),abs(dy.x))<0.7*bound.x) {
              vec4 high=texelFetch(u_blaHigh,texel,0),low=texelFetch(u_blaLow,texel,0);
              vec2 ar=vec2(high.x,low.x),ai=vec2(high.y,low.y);
              vec2 br=vec2(high.z,low.z),bi=vec2(high.w,low.w);
              float oldDelta=safeLength(vec2(dx.x,dy.x));
              float oldC=safeLength(vec2(dcX.x,dcY.x));
              errorBound=safeLength(high.xy)*errorBound + float(block)*2e-13*(safeLength(high.xy)*oldDelta+safeLength(high.zw)*oldC);
              vec2 nx=dsAdd(dsSubtract(dsMultiply(ar,dx),dsMultiply(ai,dy)),dsSubtract(dsMultiply(br,dcX),dsMultiply(bi,dcY)));
              dy=dsAdd(dsAdd(dsMultiply(ar,dy),dsMultiply(ai,dx)),dsAdd(dsMultiply(br,dcY),dsMultiply(bi,dcX)));
              dx=nx;
              consumed+=block;
              m+=block;
              state=vec4(dx,dy);
              vec4 endpoint=referenceAt(m);
              if(errorBound>ERROR_TOLERANCE*max(1.0,safeLength(endpoint.xy+vec2(dx.x,dy.x))))meta.w=1.0;
              skipped=true;
              break;
            }
          }
        }
        if(meta.w==1.0)break;
        if(skipped)continue;
        vec4 z=referenceAt(m);
        float previousMagnitude=safeLength(z.xy+vec2(dx.x,dy.x));
        float deltaMagnitude=safeLength(vec2(dx.x,dy.x));
        errorBound=(2.0*previousMagnitude+errorBound)*errorBound + 4e-14*((2.0*safeLength(z.xy)+deltaMagnitude)*deltaMagnitude+safeLength(vec2(dcX.x,dcY.x)));
        vec2 linearX=dsSubtract(dsMultiply(z.xz,dx),dsMultiply(z.yw,dy));
        vec2 linearY=dsAdd(dsMultiply(z.xz,dy),dsMultiply(z.yw,dx));
        vec2 squareX=dsSubtract(dsMultiply(dx,dx),dsMultiply(dy,dy));
        vec2 squareY=dsMultiply(dx,dy);
        dx=dsAdd(dsAdd(dsAdd(linearX,linearX),squareX),dcX);
        dy=dsAdd(dsAdd(dsAdd(linearY,linearY),dsAdd(squareY,squareY)),dcY);
        m++;
        vec4 nextReference=referenceAt(m);
        vec2 ax=dsAdd(nextReference.xz,dx), ay=dsAdd(nextReference.yw,dy);
        vec2 actual=vec2(ax.x+ax.y,ay.x+ay.y);
        vec2 delta=vec2(dx.x+dx.y,dy.x+dy.y);
        magnitudeSquared=dot(actual,actual);
        if (errorBound>ERROR_TOLERANCE*max(1.0,safeLength(actual)) || any(isnan(actual)) || any(isinf(actual)) ||
            (magnitudeSquared < 1e-12*dot(nextReference.xy,nextReference.xy) && dot(nextReference.xy,nextReference.xy)>0.0)) {
          meta.w=1.0;
          break;
        }
        if (magnitudeSquared < dot(delta,delta)) { dx=ax; dy=ay; m=0; }
        state=vec4(dx,dy);
      } else {
        vec2 zr = state.xy, zi = state.zw;
        float previousMagnitude=safeLength(vec2(zr.x,zi.x));
        errorBound=(2.0*previousMagnitude+errorBound)*errorBound+4e-14*(previousMagnitude*previousMagnitude+safeLength(c));
        vec2 xy = dsMultiply(zr, zi);
        zr = dsAdd(dsSubtract(dsMultiply(zr,zr), dsMultiply(zi,zi)), cX);
        zi = dsAdd(dsAdd(xy,xy), cY);
        state = vec4(zr, zi);
        vec2 actual = vec2(zr.x+zr.y, zi.x+zi.y);
        magnitudeSquared = dot(actual,actual);
        if(errorBound>ERROR_TOLERANCE*max(1.0,safeLength(actual))) {meta.w=1.0;break;}
      }
      consumed++;
      if (magnitudeSquared > FORMULA_BAILOUT_SQUARED) {
        meta.y = float(u_completed+consumed);
        meta.z=magnitudeSquared;
        break;
      }
    }
    meta.x = float(m);
    if(meta.y==0.0)meta.z=errorBound;
  }
  ${resumable ? "outState = state; outMeta = meta;" : `
  if (meta.w == 1.0) outColor = vec4(0.0);
  else outColor = vec4(meta.y > 0.0 ? colorFromEscape(int(meta.y)-1, meta.z) : vec3(0.0), 1.0);`}
}
`;
}

export const resolveShaderSource = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform sampler2D u_meta;
uniform vec2 u_tileOrigin;
uniform bool u_final;
${sharedColorFunctions}
void main() {
  vec4 meta = texelFetch(u_meta, ivec2(gl_FragCoord.xy-u_tileOrigin), 0);
  if (meta.w == 1.0) { outColor = vec4(0.0); return; }
  if (meta.y == 0.0 && meta.w == 0.0 && !u_final) discard;
  outColor = vec4(meta.y > 0.0 ? colorFromEscape(int(meta.y)-1,meta.z) : vec3(0.0), 1.0);
}`;

export const displayShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
uniform vec2 u_offset;
uniform vec2 u_scale;
void main() {
  vec2 uv = 0.5 + u_offset + (v_uv-0.5)*u_scale;
  if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) outColor=vec4(0.0,0.0,0.0,1.0);
  else outColor=vec4(texture(u_image,uv).rgb,1.0);
}`;
