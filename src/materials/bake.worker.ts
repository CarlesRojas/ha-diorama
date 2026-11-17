import { bake, type SurfaceKind } from '#/materials/fields.ts'

// Builds a surface's pattern away from the page, see textures.ts. Asked for
// a kind, it answers with the kind and its pattern, whose buffers it hands
// over rather than copies.
onmessage = (event: MessageEvent<SurfaceKind>) => {
  const kind = event.data
  const { light, normal } = bake(kind)
  postMessage({ kind, light, normal }, { transfer: [light.buffer, normal.buffer] })
}
