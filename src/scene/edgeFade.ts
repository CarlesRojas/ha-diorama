import { EDGE_FADE_CORNER, EDGE_FADE_DEPTH } from '#/theme.ts'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

// The picture fades away to nothing towards the card's edges, see theme.ts.
// It was a mask laid over the canvas, which the browser applied again to
// every frame the card drew, a pass over every pixel of the card on the
// page's own time. The finished picture is now faded as it is drawn, in the
// last pass that draws it anyway, to the same rounded shape.
const fragmentShader = /* glsl */ `
uniform vec2 size;
uniform float depth;
uniform float corner;

// How far inside a rounded rectangle a point is, negative inside.
float rounded(vec2 p, vec2 extent, float r) {
  vec2 q = abs(p) - extent + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float side = min(size.x, size.y);
  vec2 p = (uv - 0.5) * size;
  float inside = -rounded(p, size * 0.5, corner * side);
  float t = clamp(inside / (depth * side), 0.0, 1.0);
  // Eased in and out, so the fade has no line where it starts or ends.
  float k = t * t * (3.0 - 2.0 * t);
  // The canvas holds its colors multiplied by their alpha.
  outputColor = inputColor * k;
}
`

export class EdgeFadeEffect extends Effect {
  constructor() {
    super('EdgeFadeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['size', new Uniform(new Vector2(1, 1))],
        ['depth', new Uniform(EDGE_FADE_DEPTH / 100)],
        ['corner', new Uniform(EDGE_FADE_CORNER / 100)],
      ]),
    })
  }

  setSize(width: number, height: number) {
    ;(this.uniforms.get('size')!.value as Vector2).set(width, height)
  }
}
