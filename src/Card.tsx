import { DEFAULT_ASPECT_RATIO_MOBILE } from '#/constants.ts'
import { aspectRatioCss } from '#/lib/aspect.ts'
import { useBackToHome } from '#/lib/backButton.ts'
import { useDevSettings } from '#/lib/devSettings.ts'
import { cn } from '#/lib/utils.ts'
import { EDGE_FADE_MASK } from '#/theme.ts'
import arrowLeft from '@phosphor-icons/core/assets/bold/arrow-left-bold.svg?raw'
import { useEditorOpen } from '#/lib/editorOpen.ts'
import { useEmptyClick } from '#/lib/emptyClick.ts'
import { followedRoom, useFollow } from '#/lib/follow.ts'
import { cardKey, keepRoom, lastRoom } from '#/lib/lastRoom.ts'
import { usePreviewRoom } from '#/lib/previewRoom.ts'
import { useRoomFilter } from '#/lib/roomFilter.ts'
import { thisScreen } from '#/lib/screen.ts'
import { FpsBadge, type FpsTicks } from '#/scene/FpsMeter.tsx'
import Scene, { type CameraHandle } from '#/scene/Scene.tsx'
import type { CameraView, CardConfig, HomeAssistant } from '#/types.ts'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  // In a panel view the card has the screen to itself and nothing to
  // scroll, so the wheel and a finger dragged up or down move the view.
  panel?: boolean
  // The copy of the card in Home Assistant's edit dialog, which follows the
  // room the card's settings are working on.
  preview?: boolean
}

// Whether the camera stands in a view, give or take the rounding a view is
// read with. Standing means no one has orbited away since it landed there.
const VIEW_TOLERANCE_M = 0.02
const sameView = (a: CameraView, b: CameraView) =>
  a.position.every((v, i) => Math.abs(v - b.position[i]) <= VIEW_TOLERANCE_M) &&
  a.target.every((v, i) => Math.abs(v - b.target[i]) <= VIEW_TOLERANCE_M)

export default function Card({ hass, config, panel = false, preview = false }: Props) {
  const hasRooms = (config.rooms?.length ?? 0) > 0
  // Hidden under the fullscreen editor, so it holds its last frame.
  const paused = useEditorOpen()
  const camera = useRef<CameraHandle | null>(null)
  // Whether the camera has left the view the card opened with. While it
  // has, a click on nothing takes it back.
  const [away, setAway] = useState(false)
  const { fps } = useDevSettings()
  const [fpsTicks] = useState<FpsTicks>(() => [])
  // A click on a room's floor takes the camera to the view saved for it. A
  // second click on that floor takes it back to the opening one, however
  // the camera has been turned, panned or zoomed since. The saved view is
  // fitted to the card the way the opening one is, backed off along its
  // angle until the whole room shows. A room with no view saved has the one
  // the camera works out for it, the room alone filling the picture.
  //
  // The room flown to stands alone: the rest of the home fades away and
  // takes no presses until the camera heads back.
  //
  // A card built again, as when the app comes back from the background,
  // opens on the room it was showing. The edit dialog's copy follows the
  // settings instead.
  const card = preview ? null : cardKey(config)
  const [focus, setFocus] = useState<string | null>(() => (card ? lastRoom(card) : null))
  const roomOf = (id: string) => config.rooms?.find(r => r.id === id)
  const viewOf = (id: string) => {
    const room = roomOf(id)
    return room && camera.current?.show(room)
  }
  // A room that has left the plan holds no focus.
  const focused = focus !== null && roomOf(focus) ? focus : null
  // The side panel follows the room in view, and the Diorama tiles on the
  // dashboard too when the card says so.
  useRoomFilter(focused ? roomOf(focused) : undefined, config.filter_tiles === true)
  useEffect(() => {
    if (card) keepRoom(card, focused)
  }, [card, focused])
  const goHome = () => {
    setFocus(null)
    camera.current?.reset()
  }
  // On a screen set to follow someone, the camera flies to the room they
  // walk into, unless the card was touched in the last while. Never in the
  // edit dialog, nor under the fullscreen editor.
  const follow = preview ? undefined : thisScreen(config)?.follow
  const touched = useFollow(followedRoom(hass, config, follow), !!follow && !paused, id => {
    if (id === focused) return true
    const view = viewOf(id)
    if (!view || !camera.current) return false
    setFocus(id)
    camera.current.flyTo(view)
    return true
  })
  // The back button, a phone's own too, takes a room in view back to the
  // whole home. Not in the edit dialog, whose back closes it.
  useBackToHome(
    focused !== null,
    () => {
      touched()
      goHome()
    },
    !preview,
  )
  // So does a click on empty space anywhere on the dashboard, like the side
  // panel around its tiles or the gaps between cards.
  useEmptyClick(focused !== null && !preview, () => {
    touched()
    goHome()
  })
  const showRoom = (asked: string, through?: string[]) => {
    // A press on a door or a window in the wall of the focused room goes
    // through it, to the room on its other side, when that one has a view.
    const beyond = focused && through?.includes(focused) ? through.find(id => id !== focused && roomOf(id)) : undefined
    // Around a focused room only that room can be pressed, and the pieces in
    // its walls that were put in the room on the other side. A press on one
    // of those with nowhere to go is a press on the room that is showing.
    const id = beyond ?? focused ?? asked
    const view = viewOf(id)
    if (!view || !camera.current) return
    if (id === focused || sameView(camera.current.view(), view)) goHome()
    else {
      setFocus(id)
      camera.current.flyTo(view)
    }
  }
  // In the edit dialog the camera goes to the room whose tiles are being
  // worked on, and back to the whole home when the home's are. The 3D view
  // may still be loading, so it is tried again on the next frames until the
  // camera is there.
  const asked = usePreviewRoom()
  const previewing = preview ? asked : null
  const followed = useRef<string | null>(null)
  useEffect(() => {
    // The card opens on the whole home already, with nothing to undo.
    if (!preview || previewing === followed.current) return
    followed.current = previewing
    let frame = 0
    let tries = 0
    const go = () => {
      if (!camera.current) {
        if (++tries < 120) frame = requestAnimationFrame(go)
        return
      }
      const view = previewing ? viewOf(previewing) : undefined
      if (view) {
        setFocus(previewing)
        camera.current.flyTo(view)
      } else goHome()
    }
    go()
    return () => cancelAnimationFrame(frame)
    // Only a change of the room asked for moves the camera.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewing])
  // A click on nothing at all, the air around the home or where the faded
  // rooms were, takes the camera back to the opening view.
  const showHome = () => {
    if (away || focused) goHome()
  }
  // With rooms first, a click on a device in a room the camera has not flown
  // to goes to that room. The card comes with devices first, where a device
  // answers from anywhere.
  const roomFirst = (id: string, ask = false) => {
    // With a room focused, whatever can be pressed is in it or in its walls.
    if (config.first_click !== 'room' || focused || !roomOf(id) || !camera.current) return false
    if (ask) return true
    showRoom(id)
    return true
  }

  // A card set to fill takes the shape of whatever holds it, as the split
  // card's main column does.
  const fill = config.aspect_ratio === 'fill'
  const wide = aspectRatioCss(config.aspect_ratio)
  // A card given one shape keeps it at every width. Only a card given none
  // turns square when it is narrow.
  const narrow = aspectRatioCss(config.aspect_ratio_mobile, config.aspect_ratio ? wide : DEFAULT_ASPECT_RATIO_MOBILE)

  return (
    // No background, border or shadow: nothing says where the card ends and
    // the dashboard begins.
    <ha-card style={{ background: 'none', border: 'none', boxShadow: 'none', height: fill ? '100%' : undefined }}>
      {/* The card's shape follows its own width, not the window's: a card
        in a narrow column on a wide screen is as narrow as one on a phone. */}
      <div
        className={cn('@container w-full', fill && 'h-full')}
        onPointerDownCapture={touched}
        onWheelCapture={touched}
        onKeyDownCapture={touched}
      >
        <div
          className={cn(
            'relative w-full overflow-hidden',
            fill ? 'h-full' : 'aspect-(--aspect) @max-[600px]:aspect-(--aspect-narrow)',
          )}
          style={
            {
              '--aspect': wide,
              '--aspect-narrow': narrow,
            } as CSSProperties
          }
        >
          {hasRooms ? (
            <>
              <div className="absolute inset-0" style={{ mask: EDGE_FADE_MASK, WebkitMask: EDGE_FADE_MASK }}>
                <Scene
                  hass={hass}
                  config={config}
                  paused={paused}
                  cameraRef={camera}
                  onPickRoom={showRoom}
                  onPickNothing={showHome}
                  onCameraAway={value => {
                    setAway(value)
                    if (!value) setFocus(null)
                  }}
                  focus={focused}
                  roomFirst={roomFirst}
                  wheelZoom={panel}
                  fpsTicks={fps ? fpsTicks : undefined}
                />
              </div>
              {fps && <FpsBadge ticks={fpsTicks} />}
              {/* With a room in view, an arrow in the corner takes it back to
                the whole home, for a phone with no back button of its own. Just
                the arrow, faint, over a target big enough for a finger. */}
              {!preview && (
                <button
                  type="button"
                  aria-label="Back to the whole home"
                  title="Back to the whole home"
                  tabIndex={focused ? 0 : -1}
                  aria-hidden={!focused}
                  onClick={goHome}
                  className={cn(
                    'duration-slow absolute top-2.5 left-2.5 z-10 grid size-11 cursor-pointer place-items-center rounded-full border-none bg-transparent p-0 text-(--primary-text-color,#e1e1e1) transition [-webkit-tap-highlight-color:transparent] active:scale-90 [&>svg]:size-7',
                    focused ? 'mouse:hover:opacity-100 opacity-60' : 'pointer-events-none opacity-0',
                  )}
                  dangerouslySetInnerHTML={{ __html: arrowLeft }}
                />
              )}
            </>
          ) : (
            <div className="font-montserrat flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
              <p className="text-sm font-semibold">No rooms yet</p>
              <p className="text-xs opacity-70">Add rooms to the card config to see your diorama.</p>
            </div>
          )}
        </div>
      </div>
    </ha-card>
  )
}
