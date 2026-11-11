import {
  CAMERA_FAR_M,
  CAMERA_FOV_DEG,
  CAMERA_MAX_DISTANCE_M,
  CAMERA_MAX_POLAR_DEG,
  CAMERA_MIN_DISTANCE_M,
  CAMERA_MIN_POLAR_DEG,
  CAMERA_NEAR_M,
} from '#/constants.ts'
import { cn } from '#/lib/utils.ts'
import { ROOM_CORNER_RADIUS_M, ROOM_GAP_M } from '#/theme.ts'
import Adaptive from '#/scene/Adaptive.tsx'
import CameraRig, { type CameraHandle } from '#/scene/CameraRig.tsx'
import Cleanup from '#/scene/cleanup.tsx'
import Devices from '#/scene/Devices.tsx'
import Effects from '#/scene/Effects.tsx'
import Merged from '#/scene/Merged.tsx'
import Passages from '#/scene/Passages.tsx'
import PickFallback from '#/scene/pick.tsx'
import Room from '#/scene/Room.tsx'
import Shadows from '#/scene/shadows.tsx'
import Sky, { type SkyMode } from '#/scene/Sky.tsx'
import type { TryStates } from '#/editor/tryState.ts'
import { FpsTicker, type FpsTicks } from '#/scene/FpsMeter.tsx'
import { occupied } from '#/scene/presence.ts'
import type { CardConfig, HomeAssistant } from '#/types.ts'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { MathUtils, PCFShadowMap } from 'three'
import { useCallback, useRef, useState, type RefObject } from 'react'

export type { CameraHandle } from '#/scene/CameraRig.tsx'

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  // The editor can hold the room at day or at night to see how it looks.
  sky?: SkyMode
  // Whether the wheel zooms the view and a finger dragged up or down turns
  // it. Off in a card on a dashboard that scrolls, where both scroll past
  // it. On in a panel view and in the editor's preview.
  wheelZoom?: boolean
  // In the editor, a press in 3D also picks what it landed on, so the plan
  // and the sidebar follow the view.
  onPickDecoration?: (id: string) => void
  // A press on a piece in a wall between rooms also says which rooms.
  onPickRoom?: (id: string, through?: string[]) => void
  // A click that lands on nothing at all, which lets go of whatever was
  // picked, the way a click on the plan's empty background does.
  onPickNothing?: () => void
  // What the editor has picked, as `decoration:<id>` or `room:<id>`, drawn
  // with a blue outline. The card never passes one.
  selected?: string | null
  // States the editor tries on pieces, in place of their devices. The card
  // passes none.
  tries?: TryStates
  onTry?: (id: string) => void
  // Stops drawing and holds the last frame, for a card nobody can see.
  paused?: boolean
  // Filled with the camera's handle, to read the view or fly to one.
  cameraRef?: RefObject<CameraHandle | null>
  // Told when the camera leaves the view it opened with, and when it is back.
  onCameraAway?: (away: boolean) => void
  // The room that stands alone in the card, the rest of the home faded away
  // and out of reach.
  focus?: string | null
  // Asked before a click acts on a device, with the room its piece stands
  // in. True means the click went to the room instead. Only asked, it says
  // whether a click would, and goes nowhere.
  roomFirst?: (room: string, ask?: boolean) => boolean
  // Filled with when each frame is drawn, for counting them.
  fpsTicks?: FpsTicks
}

export default function Scene({
  hass,
  config,
  sky = 'auto',
  wheelZoom = false,
  onPickDecoration,
  onPickRoom,
  onPickNothing,
  selected,
  tries,
  onTry,
  paused = false,
  cameraRef,
  onCameraAway,
  focus,
  roomFirst,
  fpsTicks,
}: Props) {
  const rooms = config.rooms ?? []
  const radius = config.radius ?? ROOM_CORNER_RADIUS_M
  const gap = config.gap ?? ROOM_GAP_M
  // When the press fallback last handed a near miss to a piece. Three still
  // sees that same click as landing on nothing, a moment later, and without
  // this it would let go of the piece the fallback had just picked.
  const fallbackAt = useRef(0)
  const markFallback = useCallback(() => {
    fallbackAt.current = performance.now()
  }, [])
  // The controls listen on this element around the canvas rather than on
  // the canvas itself, so a press on the canvas reaches them only by
  // bubbling, and the camera rig can keep a click from them. They are only
  // mounted once it is there to listen on.
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)

  return (
    // In the card a finger that sets off up or down scrolls the dashboard
    // past it, and one that sets off sideways turns the home, and then tilts
    // it too for as long as it stays down. The controls ask for every touch
    // on the element they listen on, so this has to outrank them. The editor
    // has nothing to scroll and keeps every touch.
    <div ref={setFrame} className={cn('relative h-full w-full', !wheelZoom && 'touch-pan-y!')}>
      <Canvas
        // Percentage closer filtering across the map, so the edge comes out
        // soft and clean, and softness comes from how fine the map is. This
        // is what three's soft variant became: since 0.186 that name only
        // warns and falls back to this one.
        shadows={{ type: PCFShadowMap }}
        // A frame is drawn only when something has changed, see live.ts.
        frameloop={paused ? 'never' : 'demand'}
        dpr={[1, 2]}
        // The frame is finished from a buffer and smoothed there, so the
        // screen's own smoothing would only cost.
        gl={{ alpha: true, antialias: false }}
        camera={{ fov: CAMERA_FOV_DEG, near: CAMERA_NEAR_M, far: CAMERA_FAR_M }}
        // Three only calls a press missed when it barely moved, so letting go
        // of the camera after orbiting never counts. A right click is left
        // alone, and so is a click the fallback just gave to a piece nearby.
        onPointerMissed={
          onPickNothing &&
          ((e: MouseEvent) => {
            if (e.button !== 0) return
            if (performance.now() - fallbackAt.current < 400) return
            onPickNothing()
          })
        }
      >
        <Sky hass={hass} rooms={rooms} mode={sky} direction={config.sun_direction} />
        {/* Everything solid casts and receives, so a lamp throws the things
          around it onto the floor. */}
        <Shadows />
        <Cleanup />
        <Adaptive />
        {fpsTicks && <FpsTicker ticks={fpsTicks} />}
        <CameraRig
          rooms={rooms}
          decorations={config.decorations ?? []}
          view={config.camera}
          framed={config.frame_rooms}
          focus={focus}
          handle={cameraRef}
          onAway={onCameraAway}
          wheelZoom={wheelZoom}
        />
        <Devices
          hass={hass}
          config={config}
          onPick={onPickDecoration}
          tries={tries}
          onTry={onTry}
          roomFirst={roomFirst}
          // The editor picks a room from its floor, never from a door.
          onRoom={onPickDecoration ? undefined : onPickRoom}
        />
        {/* In the card, the pieces with no device behind them are drawn
          together, a room at a time. In the editor every piece is its own,
          so it can be picked and tried. */}
        {!onPickDecoration && !onTry && <Merged config={config} />}
        {/* A press that misses everything looks around itself for something
          to act on, so small things are still easy to hit, and only then
          asks whether it landed on a room's floor. */}
        <PickFallback onHandled={markFallback} onRoom={onPickRoom} />
        {/* In the card, a focused room shows the way into a room open beside it. */}
        {!onPickDecoration && onPickRoom && (
          <Passages rooms={rooms} decorations={config.decorations ?? []} onRoom={onPickRoom} />
        )}
        {/* The frame is finished from a buffer: shaded where things meet,
          tone mapped, softly darkened at the corners, and in the editor with
          the picked thing outlined. */}
        <Effects selected={selected} focus={focus} />
        {rooms.map((room, i) => (
          <Room
            key={room.id}
            room={room}
            rooms={rooms}
            index={i}
            radius={radius}
            gap={gap}
            occupied={occupied(hass, room)}
          />
        ))}
        {frame && (
          <OrbitControls
            makeDefault
            domElement={frame}
            enablePan
            screenSpacePanning={false}
            enableDamping
            dampingFactor={0.1}
            minPolarAngle={MathUtils.degToRad(CAMERA_MIN_POLAR_DEG)}
            maxPolarAngle={MathUtils.degToRad(CAMERA_MAX_POLAR_DEG)}
            minDistance={CAMERA_MIN_DISTANCE_M}
            maxDistance={CAMERA_MAX_DISTANCE_M}
          />
        )}
      </Canvas>
    </div>
  )
}
