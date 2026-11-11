import { decorationKind, mountHeight } from '#/decoration/catalog.ts'
import Cleanup from '#/scene/cleanup.tsx'
import DecorationModel from '#/scene/decor/DecorationModel.tsx'
import { CEILING_HEIGHT_M, LIGHT_GLOW_COLOR } from '#/theme.ts'
import type { DecorationConfig } from '#/types.ts'
import { cn } from '#/lib/utils.ts'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Bounds, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Color } from 'three'

// Where the camera starts, looking at the piece from the front corner.
const START: [number, number, number] = [3, 2.4, 3]

type Props = {
  item: DecorationConfig
  className?: string
  style?: React.CSSProperties
  // The sidebar measures this box when the handle is dragged.
  boxRef?: React.Ref<HTMLDivElement>
  // The piece can be turned, zoomed and panned by hand, with a button to
  // bring the view back once it has been.
  interactive?: boolean
}

// Small turntable view of one decoration item, shown lit. The camera fits
// the model and keeps it centered as its size changes.
export default function ModelPreview({ item, className, style, boxRef, interactive = false }: Props) {
  // Moved by hand, the piece stops turning on its own until the view is
  // brought back.
  const [moved, setMoved] = useState(false)
  const [resets, setResets] = useState(0)
  const kind = decorationKind(item.kind)
  if (!kind) return null
  const glow = new Color(item.light_color ?? LIGHT_GLOW_COLOR)
  // A little under full, so the shade does not wash out, and dimmer with the
  // piece's own brightness.
  const lit = 0.8 * (item.light_brightness ?? 1)
  const centered: DecorationConfig = { ...item, position: [0, 0], rotation: 0 }
  // Centered on where the item actually sits, so a door standing on the
  // floor is in frame and a wall light hangs at its own height. Ceiling
  // items hang from a virtual ceiling 1.4 m up, so the cord does not
  // dominate the frame.
  const lift = kind.mount === 'ceiling' ? -(CEILING_HEIGHT_M - 1.4) : -mountHeight(kind, item.params)
  return (
    <div ref={boxRef} className={cn('relative', className)} style={style}>
      <Canvas dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 35, position: START }}>
        <Cleanup />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} />
        <Bounds fit clip observe margin={1.3} maxDuration={0}>
          <Refit resets={resets} />
          <group position={[0, lift, 0]}>
            <DecorationModel
              item={centered}
              all={[centered]}
              state={{ on: true, level: lit, levels: { open: lit }, glow: [glow.r, glow.g, glow.b] }}
            />
          </group>
        </Bounds>
        <OrbitControls
          makeDefault
          enablePan={interactive}
          enableZoom={interactive}
          autoRotate={!moved}
          autoRotateSpeed={1.5}
          onStart={interactive ? () => setMoved(true) : undefined}
        />
      </Canvas>
      {moved && (
        <button
          type="button"
          aria-label="Reset the view"
          title="Reset the view"
          onClick={() => {
            setMoved(false)
            setResets(n => n + 1)
          }}
          className="text-label-2 absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-(--card-background-color)/80 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:text-(--primary-text-color)"
        >
          <FontAwesomeIcon icon={faRotateLeft} className="size-3" />
        </button>
      )}
    </div>
  )
}

// Puts the camera back where it started and fits the piece again, each time
// the view is reset.
function Refit({ resets }: { resets: number }) {
  const bounds = useBounds()
  const camera = useThree(state => state.camera)
  useEffect(() => {
    if (resets === 0) return
    camera.position.set(...START)
    bounds.refresh().reset().clip()
    // Only a reset moves the camera.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [resets])
  return null
}
