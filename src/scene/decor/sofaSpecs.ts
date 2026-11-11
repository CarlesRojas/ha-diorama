// The measurements of the sofa, in meters, after Pilma's Dresde. Pilma gives
// its seat height, its leg height and its overall sizes: 190 to 270 wide,
// and 298 by 170 with the chaise longue. The parts below are off the product
// photos, scaled by those. The sofa faces +z and is laid out again at the
// width and depth the sliders give it, so its parts keep their size and the
// seats share out the width. The models are in Sofas.tsx.

// Its real width and depth, straight and with the chaise, and how far the
// chaise reaches out from the back.
export const SOFA_WIDTH = 2.3
export const SOFA_CHAISE_WIDTH = 2.98
export const SOFA_DEPTH = 0.98
export const SOFA_REACH = 1.7

// Painted metal legs, 17 cm tall, tapering to the floor and leaning out a
// little at the foot. Radius at the top and the foot, and the lean.
export const SOFA_LEG_H = 0.17
export const SOFA_LEG_R: [number, number] = [0.016, 0.009]
export const SOFA_LEG_SPLAY = 0.12

// The base the seat cushions sit on, on top of the legs.
export const SOFA_BASE_H = 0.08

// The loose seat cushions, whose top is the 42 cm seat before anyone sits.
export const SOFA_SEAT_H = 0.17
// A seat is never narrower than this. Once the width holds one more at
// this width, it shares out among one seat more.
export const SOFA_SEAT_MIN = 0.8
// A count chosen in the editor can make them narrower, down to this, and no
// more than this many.
export const SOFA_SEAT_NARROWEST = 0.45
export const SOFA_SEATS_MAX = 8

// The thin padded arms, which run the whole depth down to the tops of the
// legs: thickness and top.
export const SOFA_ARM_W = 0.12
export const SOFA_ARM_TOP = 0.64

// The upholstered back frame the back cushions lean on: its thickness and
// its top.
export const SOFA_BACK_T = 0.12
export const SOFA_BACK_TOP = 0.66

// The loose back cushions, one over each seat, standing on the seat and
// leaning back onto the frame so their top is at 89 cm: height, thickness
// and lean.
export const SOFA_CUSHION: [number, number, number] = [0.5, 0.2, 0.14]

// The small lumbar cushion in front of each back cushion: width at most,
// height, thickness and lean.
export const SOFA_LUMBAR: [number, number, number, number] = [0.55, 0.3, 0.12, 0.16]

// The plinth sofa, after Hay's Mags: a low deep block standing on a dark
// plinth set back from its edges, with wide square arms and back, one seat
// cushion and one tall back cushion per seat. Plinth height and setback,
// arm width and top, back thickness and top, the deck under the cushions,
// and the back cushions' height, thickness and lean.
export const BLOCK_PLINTH: [number, number] = [0.05, 0.035]
export const BLOCK_ARM_W = 0.2
export const BLOCK_ARM_TOP = 0.6
export const BLOCK_BACK_T = 0.2
export const BLOCK_BACK_TOP = 0.7
export const BLOCK_DECK_TOP = 0.25
export const BLOCK_CUSHION: [number, number, number] = [0.42, 0.18, 0.08]

// The rail sofa, after Karimoku's Castor: an open teak frame on round
// tapered legs, a flat board for each arm and rails round the seat, with
// the cushions laid in it. Arm board width, thickness and top, leg radius
// at the top and the foot, the seat rails' height and top, the upholstered
// back's thickness and top, and the back cushions' height, thickness and
// lean.
export const RAIL_ARM: [number, number, number] = [0.07, 0.03, 0.6]
export const RAIL_LEG_R: [number, number] = [0.022, 0.015]
export const RAIL_SEAT_RAIL: [number, number] = [0.07, 0.3]
export const RAIL_BACK_T = 0.08
export const RAIL_BACK_TOP = 0.74
export const RAIL_CUSHION: [number, number, number] = [0.44, 0.16, 0.18]

// How wide each style's arms are, which the seats sit between.
export function sofaArmWidth(style: string | undefined) {
  if (style === 'block') return BLOCK_ARM_W
  if (style === 'rail') return RAIL_ARM[0]
  return SOFA_ARM_W
}

// How many seats a sofa `inner` wide between its arms has when left to its
// size: as many as fit at their narrowest, so each one stretches until the
// next one fits. A chaise is an end seat, so it leaves at least one more.
// And the fewest and the most it can be given.
export function sofaSeatRange(inner: number, chaise: boolean) {
  const fewest = chaise ? 2 : 1
  const auto = Math.max(fewest, Math.floor(inner / SOFA_SEAT_MIN + 1e-6))
  const most = Math.min(SOFA_SEATS_MAX, Math.max(auto, Math.floor(inner / SOFA_SEAT_NARROWEST + 1e-6)))
  return { auto, fewest, most: Math.max(fewest, most) }
}
