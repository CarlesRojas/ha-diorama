# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
follow [Semantic Versioning](https://semver.org/).

Write every change under Unreleased as you make it. The release workflow
moves that section under the new version and uses it as the release notes.

## [Unreleased]

### Added

- Multi-floor management: create, reorder, rename and assign elevations to floors with drag-and-drop handles and double-click configuration.
- 2D onion-skin reference mode displaying room outlines of other floors while drawing or editing.
- Per-room custom floor slab thickness slider (`room.thickness`, 1 cm to 100 cm).
- Per-floor isolated trace images for blueprint alignment across storeys.
- Expanded room elevation range (-10 m to +25 m) and stair rise range (up to 8 m, unlocking vertical ceiling clamping).
- Interactive stairs with lighting support: bind light/switch entities, glow and toggle stairs directly.
- Direct numeric input on sliders: click any parameter, elevation, thickness, or rotation value to type exact numbers.
- Free camera orbit angle allowing views from below floor level.

### Changed

- Automatic solid floor step drop is capped at 50 cm; larger vertical gaps keep the slab slim and open.
- Floor pill reordering automatically synchronizes 3D elevations while preserving relative floor heights.

### Fixed

- Item drag-and-drop in 2D editor strictly scoped to active floor rooms, preventing items from jumping to onion-skin rooms on other floors.
- Room polygon vertex and edge dragging collision checks scoped to the active floor, enabling rooms on different storeys to overlap freely in 2D space without false invalid collision errors.
- Between-wall decorations (windows, doors, openings) isolated strictly by floor so items on one floor do not punch openings into walls on another.
- Floorless rooms strictly resolve to base floor `floor-0` during floor reordering without mutating active floor assignment.

### Added

- A piano in three styles, a desk lamp in two, three more ceiling lights, and a switch to hang the sideboard on the wall at any height.
- Stairs that climb a full storey or a few steps, including a floating style with only its treads, a railing in steel, glass or oak spindles for the edge of a raised floor, a 3D printer that lights its chamber while it prints, a router, a wall tablet that shows a dashboard, a sim racing cockpit, a driveway gate that opens with its cover, a terrace door whose two leaves both swing open, and a Hue style tilted ring table lamp.
- Plants, vases, books and other small pieces can stand on a wall shelf, and a plant can stand in for its sensors or Home Assistant plant, wilting and yellowing when its soil runs dry.
- Hold Shift to draw rooms and place pieces to the centimeter, and turn a piece a quarter at a time from buttons in its panel.
- A smoke detector can stand in for a carbon monoxide sensor or a sensor that reports smoke in words, and anything that switches can stand in for a group.
- Your own 3D models can be imported into the editor's catalog from a .glb or .gltf file, under My models, and placed, sized, recolored part by part and hung on a wall or a ceiling like any other piece, drawn in the card's own colors.
- A Use a background switch at the top of the editor's Background section turns the card's background off, leaving the dashboard's own.
- A room's floor can be raised or sunk from its block in the editor, for a platform, a step or a sunken living room, and everything in the room goes up or down with it.
- A crib, a bassinet, a loft bed, a kids sofa, a rocking chair, a sound machine, string lights, a ceiling fan with a light, a bathroom fan, a chest freezer and a dog kennel, each in two or three styles.
- A room can take a presence sensor, and while someone is in it its floor is seen through a filter in a color of your choice, a soft darkening to start with.
- A piece can be set to only show its device's state, so a click on it opens the device's dialog instead of switching it.
- A curtain can be a single panel that opens to the left or to the right.

### Changed

- Diorama needs Home Assistant 2024.6 or newer, and HACS says so before installing it.
- Ceiling lights glow on top too, so from above you can see they are on and in what color.

### Fixed

- Lights in a group, a device's own sensors such as a washing machine's door, and binary sensors of every kind can be picked for a piece.
- On older Home Assistant versions the editor responds to clicks again, where it opened but nothing in it could be clicked, and on 2024.6 the side panel shows its widgets again.
- The catalog keeps its place after adding an item, and the arrow into the next room no longer hides behind a window or curtain on that wall.

## [1.8.29] - 2026-10-21

### Fixed

- On desktop a quick click on a room is no longer sometimes ignored.

## [1.8.28] - 2026-10-20

### Fixed

- When the app comes back from the background the flat stays on screen as it was, instead of flickering while it loads again.

## [1.8.27] - 2026-10-20

### Changed

- The arrow that takes a room back to the whole home is now just a faint arrow, larger and easier to tap.

## [1.8.26] - 2026-10-20

### Changed

- In the Android companion app the navigation bar at the bottom takes the color of the card's background, which melts into it, as the status bar already does.

### Fixed

- A long press no longer opens Home Assistant's dialog when the finger was on a button or a slider inside a widget, had moved, or had already dragged something like a blind, and two fingers held still on the home no longer open one either.

## [1.8.25] - 2026-10-20

### Added

- With a room in view, an arrow in the top left corner of the card takes it back to the whole home.

### Changed

- A drag on a cover tile with a position slider and buttons no longer starts on its buttons, so they press like any other button.

## [1.8.24] - 2026-10-20

### Fixed

- A phone's swipe home that crosses a slider tile, like a blind's, no longer moves it.
- The buttons on a slider tile show they are pressed again when the fill lies over them.
- The card stays on the room it was showing when the app comes back from the background, instead of going back to the whole home.

## [1.8.23] - 2026-10-14

### Changed

- The weather tile shows the moon behind a cloud on partly cloudy nights, instead of the sun.

## [1.8.22] - 2026-10-14

### Fixed

- In the companion app the status bar melts into the card's background, with no line where it ends.

## [1.8.21] - 2026-10-14

### Added

- Each phone, tablet or computer can have its own share of the screen for the 3D view, beside the widgets and over them, set from the card settings on that screen.

### Changed

- In the companion app the status bar takes the color of the card's background instead of the header's.

### Fixed

- A cover tile with a position slider and buttons can now be dragged starting on its buttons, and a drag never presses them.

## [1.8.20] - 2026-10-14

### Fixed

- A blind made from a template no longer jumps to where it was sent and back as it starts to move, and its ghost stays until it gets there.

## [1.8.19] - 2026-10-14

### Added

- Blinds, shutters, projector screens, garage doors, awnings and sliding doors can be dragged in the 3D view to any position, also from the window behind them or from just beside them: a see-through blue copy follows the finger and stays where it was let go while the real one moves to meet it.

### Changed

- Dragging a cover's position tile leaves the fill where the cover really is and shows where it is going as a paler band, instead of jumping back and forth.

### Fixed

- What plays on a TV or a media card always has a second line under its title: the series, the artist or the channel, or else the app, or else On.

## [1.8.18] - 2026-10-14

### Added

- A cover's tile can be its position slider and still have its up, stop and down buttons, as Position with Buttons.

### Fixed

- The buttons of a small tile, like a cover's or a vacuum's, no longer disappear in a narrow side panel, like a tablet's: the icon makes way for them and they shrink if they still do not fit.

## [1.8.17] - 2026-10-14

### Added

- A remote, or a player with its remote, can have its power key turn something else on and off, like a toggle that also readies the room, while it still shows whether the device itself is on.

## [1.8.16] - 2026-10-13

### Fixed

- A long title on a TV or a projection screen no longer repeats its second line.

### Changed

- Under the title of what plays, a TV or a projection screen shows the artist, the album or the app in a smaller line, as its card does.
- A fan, a screen, a flame or anything else that moves on its own stops after two minutes with no change to its device, so a card left alone draws nothing, and moves again as soon as the card is touched or the device changes.

## [1.8.15] - 2026-10-13

### Fixed

- A projector now shows the logo and the title of what it plays on its screen, as its card does, instead of only the colors.

### Changed

- A TV or a projector that does not say what it plays shows the name of its app on its screen.

## [1.8.14] - 2026-10-13

### Fixed

- A TV or speaker whose state Home Assistant does not know yet no longer shows as on in the model.

## [1.8.13] - 2026-10-13

### Fixed

- On a narrow phone, the remote's volume and buttons on a TV card no longer run under its round pad.

## [1.8.12] - 2026-10-13

### Changed

- A projector's beam reaches the corners of the picture on the projection screen it is aimed at, even while the screen is rolled up, and fades out just as it gets there.

### Fixed

- The picture on a projection screen no longer reads backwards, the cover on a TV drifts in and out where you can see it, a soundbar's waves stay above the bar, and a projector's beam shows through a window or other glass.

## [1.8.11] - 2026-10-13

### Added

- A TV or a projector bound to a player shows what plays like its card does, the cover or the app's colors with its logo and the title, and lights the room in that color. A cover drifts slowly in and out.

### Changed

- The cover on the now playing cards is only a little blurred, so it reads almost as sharp as it is.

### Fixed

- Play and pause on the media and remote card go through the remote, so they work in apps like Netflix, and a `play` command can be given for a remote on another device.
- The sound waves of a soundbar or a floor speaker spread flat from its top, so they no longer cut into the table or floor under it.
- On a phone, the media and remote card keeps its icon, name and state whole, with the name under the volume, and scrolls into view when it grows.

## [1.8.10] - 2026-10-13

### Changed

- The media and remote card takes `commands` and `volume_entity` like the remote card, so it works for a player whose remote is on another device.

## [1.8.9] - 2026-10-13

### Added

- The now playing card turns its player on with a double tap while it is off, then fades into what plays, and has a power button that turns it off on a second press, so it needs no other card to turn it on and off. A remote beside it, or beside a toggle for the same device, leaves out its power key.
- A media and remote card, always the whole width: while the TV is off it is two rows with only its name, turned on with a double tap, and once on it grows to show what plays, with back, home and power at the top and the remote's pad beside its play buttons and volume.

### Changed

- A remote's pad now works like a touch surface: a tap anywhere on it is OK, and a swipe steers like a stick, moving that way while the finger stays down and turning when it moves another way.
- On a phone or tablet the card draws at most 24 frames a second and without shadows, so it stays smooth and cool.

### Fixed

- A small tile too narrow for both its icon and its buttons, like a half width cover on a phone, now hides the icon and keeps the buttons.
- A remote without its power key no longer leaves an empty space beside back and home.

## [1.8.8] - 2026-10-13

### Changed

- A fan, a screen or anything else that moves on its own moves a little slower and no longer keeps the card drawing at full speed, and what spins casts no shadow, so a phone or tablet stays cool.

## [1.8.7] - 2026-10-13

### Added

- The card's settings end with its name and version.

### Changed

- At night with every light off, the home is a little brighter, so it can still be made out.

## [1.8.6] - 2026-10-13

### Changed

- More lamps cast shadows at once, ten on a computer and six on a phone or tablet, every shadow has a softer edge, and a lamp no longer casts shadows of itself with its own light.

### Fixed

- The 3D home stops drawing once nothing in it moves, even with a light on, and draws at most sixty frames a second while it does, so a phone or computer with the card open no longer warms up and drains its battery.

## [1.8.5] - 2026-10-13

### Changed

- The TV remote leaves out its power key when the side panel already has a toggle for the same TV.

## [1.8.4] - 2026-10-13

### Added

- A swipe across the TV remote's round pad moves that way, wherever the finger starts.

### Changed

- Now Playing keeps its play button, greyed out, while the player is off, so it never looks like a toggle.
- Now Playing shows the title on a single line, and at half width it leaves out the icon so its buttons fit.
- Now Playing from an app with no cover art is lit all over in a dark shade of the app's color, with brighter lights over it, on a light theme as well as a dark one.
- The TV remote's volume stands upright beside the round pad, and the name and the state are never cut short.

### Fixed

- The TV remote's volume keys work while the TV still says it is off right after being turned on.

## [1.8.3] - 2026-10-13

### Changed

- The volume on the wide TV Remote sits on the left of the arrows, centered on them, away from the icon.
- A press on a card that a device fails to take, like a TV still waking up, no longer shows a red error at the bottom of the screen.

### Fixed

- A card with no buttons to show, like Now Playing while nothing plays, no longer shows an empty pill in its top right corner.
- The TV Remote greys out every key but power while the TV is off, so pressing an arrow, OK or the volume no longer turns it on.
- Now Playing on a TV box shows a play or pause button for an app that never says it is paused, like Netflix, instead of a pause button that never changes.

## [1.8.2] - 2026-10-13

### Added

- The TV Remote has a power key beside back and home, which turns it on at once but turns it off only on a second press within three seconds.
- A TV, or any media player that turns on and off, can be a Double Tap Toggle, offered among its widgets.

### Changed

- Now Playing has no power button any more, and a tap on it while the player is off does nothing.

### Fixed

- Play, pause, previous and next on Now Playing for a TV box work again before anything plays, and the TV Remote greys out its volume while the TV it changes is off.

## [1.8.1] - 2026-10-13

### Changed

- A tap on Now Playing turns the player on while it is off, and a tap on the TV Remote around its keys does nothing, so both open their dialog only on a long press.
- Now Playing on a TV box that cannot tell what plays in it, like one driven as a remote, takes what plays, whether it is paused, and which buttons the app takes from the box's casting player, so an app that never skips shows no previous or next.

## [1.8.0] - 2026-10-13

### Added

- The Now Playing widget shows the logo of the app playing, like Netflix, YouTube or Spotify, with a soft light in the app's colors drifting behind it when there is no cover art.
- A TV Remote widget with arrows, OK, back, home, mute and volume, as wide as the section or half of it, which works as it is with most TVs and streaming boxes and can send the volume to the TV a box is plugged into.

### Changed

- The cards now fill whole rows of the dashboard's grid, so cards side by side line up, and a half width weather card, an on and off graph, a gauge and an empty to-do list are two rows tall.
- The to-do list's plus now opens the field to add an item right beside it, and turns green to add what is written.

## [1.7.1] - 2026-10-13

### Fixed

- A Now Playing widget half as wide is now as tall as the other widgets beside it, even while nothing plays.
- A Now Playing widget whose player has no title to give, like a speaker playing from a phone, now shows the player's name with Not Provided under it.
- A Now Playing widget no longer shows an app's package id, like com.google.android.apps.tv.dreamx, when the player has no name for the app, and says whether the player is on instead.

## [1.7.0] - 2026-10-12

### Added

- Home Assistant's list of every card now has each way of setting up a Diorama card as a card of its own, like Diorama Double Tap Toggle or Diorama Toggle with Color.
- The Now Playing widget can be made two rows tall or half as wide, leaving out the volume and keeping its buttons and how far in it is.

### Changed

- In the widget picker a tap on a card now swaps the widget for it and the plus in a card's corner adds it beside the others, and every card there has a short name, like Toggle with Color, in place of a description.
- From the whole home, a click on a door or a window between two rooms now takes you through it into the room behind, where it used to take you to the room on your side of it.

### Fixed

- A click on a speaker or a TV that is playing or paused, in the 3D view or on its widget, now pauses or plays it rather than turning it off, while one with nothing on is still switched on and off.

## [1.6.0] - 2026-10-12

### Added

- A piece can stand in for a button, like a litter box's scoop, and a click on the piece presses it and plays the piece's press.

## [1.5.1] - 2026-10-12

### Fixed

- A projector screen shows the picture of a projector aimed at it from further away, where it used to stay white.

## [1.5.0] - 2026-10-12

### Added

- The eye on a device's widget hides it from the side panel, and a row under the room's widgets brings it back.
- A switch keeps every room's widgets in the side panel on the whole home, under the Home widgets.
- A device can have more than one widget in the side panel, like a TV's on and off and its volume buttons, checked together in the widget picker.

### Changed

- The widgets have a page of their own in the card's settings, opened with Edit widgets: each room under its name, which can be renamed and moved up or down there, with its widgets as they look in the side panel, to drag into order, resize from their bottom right corner, even across the whole width, remove, or pick other widgets for with the pen.
- The card's settings are shorter, with most of the explanations taken out.
- A small cover, vacuum, thermostat or media player tile shows its buttons in the top right corner when they fit beside the icon.

### Fixed

- Pressing Escape in a dropdown of the editor no longer closes the whole editor.

## [1.4.0] - 2026-10-11

### Added

- A click on any empty space on the dashboard, like between the side panel's tiles, takes the camera from a room back to the whole home.

### Changed

- The card is now called Diorama: its type is `custom:diorama-card`, its tiles are `custom:dio-*` and its theme tokens `--dio-*`. Dashboards and themes written with the old names keep working as they are.

## [1.3.3] - 2026-10-11

### Added

- The back button, a phone's own too, takes the camera from a room back to the whole home instead of leaving the dashboard.
- A card across the whole side panel, like a camera, can be made taller a row at a time, and back down to its own size, with the minus and plus beside it in the card picker.
- The back button in the editor closes it like its Close button, and with changes not yet saved it asks first, with a button to save them and close.

### Changed

- On a wide card, as on a computer, the home and a room flown to fit right to the card's edges instead of running a little past them. A phone keeps them filling its card as before.

### Fixed

- Changing the card in its edit dialog, like reordering a room's devices, no longer sends the preview back to the whole home and flies it to the room again.

## [1.3.2] - 2026-10-11

### Changed

- A click on a door or sliding door into another room takes you there even with a blind over it, instead of working the blind.

### Fixed

- A piece picked in the editor shows its blue outline in the 3D view again, and the outline is a little more subtle.

## [1.3.1] - 2026-10-11

### Added

- A toggle or a button tile can be set to Two taps, so it only turns on, turns off or runs on a second tap and a stray tap does nothing.
- A light group's toggle tile and dial say how many of its lights are on, like 3 on.
- The card's settings have a Framed rooms section to pick the rooms the view of the whole home zooms in on, while the others still show and can be clicked.

### Changed

- A lock tile that opens the door in two taps locks it again with one tap while the door is open.
- The home and a room flown to fill the card with only a thin margin on any screen, not only on a phone.
- A room a door leads into gets an arrow on the floor just past the door too, with its own switch in the editor to turn it off.
- A tile's icon fades smoothly into the next one when it changes or fills in, instead of swapping at once.

## [1.3.0] - 2026-10-11

### Added

- A slider tile with a few stops, like a fan's speeds, shows a faint short tick at each stop hanging from its top edge.
- The card's settings have a Height on a phone slider that sets how tall the floorplan is on a narrow card, over the side panel too, so the tiles under it start higher.
- Any Floorplan tile can be set to Never hide, `never_hide: true`, to keep showing whatever room the floorplan card is in.
- A dial that is not heading for its knob shows a small dot on the ring where the room is now, in place of the arrows.
- The map card spreads its map over the whole card with the name and place on it in the bottom left, or across the top over a bar with them, with no icon either way.
- A water heater tile can show its modes as round buttons with icons beside its icon, and a wide water heater tile shows them across from its name, like a thermostat's.
- A thermostat or water heater tile can be a slider for the temperature it holds, filled as far along its range as that temperature.
- A humidifier tile can be a slider for the humidity it aims for, filled as far as that humidity, with how humid the room is now beside it.
- A fan with a few speeds can show them as round buttons beside its icon, off and each speed, or as a menu, like Home Assistant's own speed buttons.
- The floorplan card lays a soft gradient behind its view, with five to choose from in the card's editor and a separate choice for a light and a dark dashboard.
- Buttons, scripts and scenes can drive nearly every piece that switches on: each press plays it once and it goes back, so a light blinks, a fan goes one turn round, a fridge or a window opens and shuts, and a litter box turns over and back a single time.

- The preview in the card's editor shows the chosen background, and picking another one there changes only the background without loading the flat again.
- The side panel's tiles fade out and the next room's fade in when the floorplan card flies to a room or back to the whole home.
- On a light dashboard a tile that is on is dark with white text, so it stands out from the page.
- A room flown to shows a small rounded triangle, made of the next room's floor, just past each stretch it shares with a room beside it that has no door in between, and a click on it flies to that room, the way a click on a door does.
- A room selected in the editor lists the rooms beside it, shows which ones a door leads into, and has a switch for each open one to show or hide the triangle into it.
- Twelve tile cards come with the floorplan card: a heading, and tiles for lights, switches and anything else on or off, buttons and scenes, covers, vacuums, option lists, cameras, thermostats, media players, locks, the weather with its forecast, and any other entity with its state. A tap does the obvious thing, a long press opens the entity's dialog, and each one can be set up in the visual card editor.
- When the floorplan card flies to a room, the Floorplan tiles of every other area hide and empty sections fold away, until the card goes back to the whole home.
- A Floorplan Glass theme with a dark gradient background, and dialogs and cards to match the tiles.
- The floorplan card can show a side panel of tiles, switched on in its editor in any kind of view: the floorplan takes two thirds of the card and a tile for each device on the plan fills the rest, room by room, and on a phone the tiles go under a square floorplan. Scenes, sensors, thermostats and other entities with no piece on the plan can be added to a room's tiles from the same editor. Each room's tiles can be put in order by dragging them in the editor.
- The tile icons can be picked as `ph:` icons in Home Assistant's icon picker and used on any card.
- The floorplan card's `aspect_ratio` can be `fill`, to take the whole height of what holds it.
- The side panel can have a section for the whole home, set in the card's editor above the tiles by room, with a heading that reads Home unless it is renamed and any entities, such as a scene, a script, the weather or a group of lights; with any there, the whole home shows only those tiles and each room's tiles show only while that room is in view.
- A tile with no icon of its own shows the icon picked for its entity in Home Assistant.
- A TV or a monitor that is on lights the room around it in the colors on its screen, so it shows it is on even when the screen faces away.
- The tile cards show a preview in Home Assistant's card picker, and the ones made for an entity show up under Community when a card is added by entity, with the cover, media, vacuum and climate tiles offered wide with their buttons. Each suggestion says all the tile does, like Floorplan Toggle - Tap to turn on or off, drag for brightness.
- A tile's `room_filter` can be `room`, to show only while its room is in view, or `home`, to show only while the whole home is.
- A leak sensor to put on the floor: it glows blue and a puddle spreads round it when it gets wet.
- A device removed from Home Assistant is dropped from the card the next time its editor is opened, along with its bindings, so the card never keeps pointing at an entity that is gone.
- A lowered projection screen shows the same moving colors as a TV that is on when a projector that is on faces it, from either side, and the room around the end of a projector's beam is lit in those colors.
- Every setting of a piece or a room, its sizes, rotation, colors, style and floor included, has a button beside it that puts it back to its default, and the button only shows once the setting has changed.
- The 3D preview of a selected piece in the editor can be zoomed and panned as well as turned, and a button in its corner brings the view back.
- When a card is added by entity, every tile is also offered with each control it can show beside its icon, like a fan's direction, a thermostat's modes, an alarm's modes or a media player's volume, the same way Home Assistant offers its own tile.
- A light tile can be its own brightness slider: the whole tile fills as far as the light is bright, a drag sideways anywhere on it dims or brightens it, and a tap still turns it on or off.
- A fan tile can be its own speed slider the same way, moving freely under the finger and settling on the nearest speed the fan has when it lifts.
- A lock tile turns green while it is unlocked and shows a red icon and a red wash while it is locked, and it can open the door with the whole tile in two taps: the first lights half of it in white, which runs back while it waits, and a second tap lights it all, fades the green in and opens the door. In the card picker it is Floorplan Lock - Tap twice to open the door.
- A cover or a valve tile can be its own position slider the same way, filling as far as it is open, or as far as its slats are tilted, and a tap opens or closes it.
- A tile's control sits in its top right corner beside the icon, so a tile with one is as short as a plain tile, and the few with too many buttons for a small tile, like favorite positions, an alarm's modes or a vacuum's commands, always make it wide.
- A light tile can show a slim color temperature or color bar beside its icon, with a round handle, so it stays as short as a plain tile, and its state line says the light's white in kelvin or the name of its color, whichever the light is in, with a faint handle on the bar for the other one, and while the bar is dragged the tile takes that color and keeps it until the light answers.
- Eight larger cards come with the tiles and are offered beside them when a card is added by entity: an alarm panel with a keypad, a dial for a thermostat, a water heater, a humidifier or a light's brightness, a media control with the cover art, a calendar agenda, a to-do list, a history graph, a gauge and a map.
- The larger cards are laid out like a wide tile, with the icon in the top left, their buttons in the top right, the name and the state in the bottom left and what they show in the bottom right, and a tap on a light's or a humidifier's dial turns it on or off.
- The Now Playing card can show the cover art square in place of its icon, as large as the card leaves it above the title and as tall a card as with the art blurred behind it, chosen in its editor, and the card picker offers both.
- The calendar card shows the events that last all day as round pills with just their names over each day's other events, drops the colored bar beside each event, and tints its events lighter on a light dashboard.
- The first calendar of a calendar card is teal, then blue, orange, purple, pink and yellow, the event going on now stands out more, on a light dashboard the events are a deeper tint and the one going on now is solid, and the all day pills are plain grey, and the card with only today's events says Today over them too.
- The calendar's list and the option menus fade out at their top and bottom edges as they scroll, with the same thin, quiet scrollbar.
- The to-do list card lists its items across the whole card down to just over its name, in the same teal as the calendar, without lines between them, and fades out at its edges when it scrolls.
- The calendar card lists its events across the whole card down to just over its name, with a thin, quiet scrollbar, and can show only today's events, offered as its own card in the card picker.
- The Now Playing card fills from the left with a faint dark shade as the song goes on, passing behind its buttons and its volume without showing through them, shows the time played beside its buttons, seeks when swiped sideways anywhere on it, and plays or pauses with a tap.
- The Now Playing card blurs the cover art behind it less, so it can still be made out.
- The card picker no longer offers the Now Playing card for a media player that can only browse or search, as it would show next to nothing.
- The Now Playing card's volume fills white on a dark card and black on a light one, with shuffle and repeat to its right, and its level no longer gets cut off on a phone.
- The dial's ring is bigger and reaches down beside the name, with plus over minus on its left, and its number stays still as it changes, like from 21° to 21.5°, with the two ends of a range large and one over the other inside the ring.
- The alarm panel is a wide tile like the others, with its modes in the top right, a keypad beside a large line saying what the code will do, a red lock key to arm and a green open lock to disarm, and a red or green wash for armed or disarmed.
- Each tile in the side panel's home and room lists in the card's editor shows which card it is, and a press on that opens live previews of every floorplan card the entity can be, to pick another one.
- The weather tile comes in two more sizes: a square half as wide with only the weather now, and one twice as tall that lists the next days under the hours, each with its low and high on a bar across the week, and the card picker offers both.

### Changed

- On a phone, the tiles start right under the floorplan, with no gap between them.
- Picking the card for a tile in the side panel opens a page of its own in place of the settings, with the device's name and a Back button at the top, and the picked card ticked in its corner.
- A dial's name and state are never cut short, and run over the dial when they need the room.
- A dial shows the tenths of a degree small under the degree sign, and keeps their room when there are none, so the number no longer shifts as it changes.
- The Floorplan tiles elsewhere on the dashboard no longer hide when the floorplan card flies to a room, unless Hide other rooms' tiles is turned on in the card's editor, so the page no longer jumps. The side panel still follows the room.
- In Home Assistant's card picker and its suggestions for an entity, each tile card shows at the width and height it takes once added to a section, shrunk to fit, so a map, a graph or a dial no longer looks squashed.
- The arrows on a dial's paler stretch sit closer together, and at least one always shows past the knob even when the room is only a degree away.
- A thermostat's dial with a range of two temperatures fills from its start up to the low end in orange and from the high end on in blue, like Home Assistant's, with the arrows toward whichever end the room is heading for.
- While the room is heading for the value set on a dial, the stretch of its ring from where the room is now is paler, with faint arrows pointing the way it goes.
- A dial fills on the same side as Home Assistant's own, from the value to the end of the ring for cooling or a dehumidifier and all the way round on auto.
- A humidifier tile says how humid the room is beside On or Off, a fan tile says its speed while it is on, and a valve tile how far it is open.
- A media player that is playing shows its icon and its volume in a green leaning to teal.
- A media player tile with the volume is its volume across the whole tile, dragged sideways like a light's brightness, while a tap still plays or pauses it.
- A media player tile with the volume buttons says how loud it plays before what is playing.
- A number on an entity tile is its value across the whole tile, dragged sideways like a light's brightness, unless it has too many steps for a slider.
- A percentage on an entity tile, like a battery's charge, fills the whole tile from the left as far, in place of a bar beside the icon.
- The rainbow of a light's color bar and its favorite colors are softer and even in lightness, so no color glares on the tile.
- A fan's oscillate control is now a pill that fills in while on, in place of a switch.
- A cover that cannot stop shows only up and down on its wide tile.
- The weather tile can show the next hours or the next days, and the card picker offers both.
- The camera tile also shows an image entity.
- The shower's glass door stays shut, so a click on the shower always goes to the device behind it, like any other piece.

- The editor's Discard button is now Close: it closes straight away when there is nothing to save, and asks before throwing changes away when there is.
- Color settings in the editor show just the rounded color, with no gray box behind it.
- The sizes of every piece go in steps of 5 cm, the same steps it moves by on the plan, and its rotation goes in steps of 5°.
- The 2D plan in the editor looks cleaner: a fainter grid, no lines through the origin, every room in the same light gray with an outline, pieces without a device in a neutral gray, plain round icons with no ring, and a scale drawn as one rounded line.
- The editor's sidebar starts wider.
- Rooms first and the direction of the sun moved out of the editor into the card's settings, right under the button that opens the editor.
- In the card's settings, each list of entities ends in an Add entity button that opens a search right under it, listing each entity with its icon, name and id, and picking one with a click or Enter adds it.
- In the editor, clicking a piece with a device, or changing it under Try its states, only tries it out there and never switches the real device. The editor starts from how the home is when it opens and shows it that way again once it closes.
- The full screen editor has a cleaner look, with softer colors, settings gathered in rounded groups, frosted menus and tooltips, switches, slim sliders with a pill shaped handle and lighter buttons.
- The card's settings in the dashboard dialog share the editor's look, with each setting in a rounded group and its explanation under it.
- The background that keeps the dashboard's own is now called Plain and shows as a flat swatch like the others, without the dotted outline.
- Under the pointer, the sign that leads into the next room darkens a little instead of lighting up.
- Up to eight lamps cast shadows at once on a computer and four on a phone or tablet, up from four and two.
- When a lamp hands its shadow to a brighter light that comes on, the shadow fades out and the new one fades in instead of switching at once.
- A projector's beam goes through the same colors as a TV that is on, where it used to be white.
- The demo flat in demoflat.yaml is refurnished, with a camera, an alarm panel, a humidifier and a water heater, its side panel on with the tiles of each room in order, and a click on another room flying to it first.
- A TV or laptop that is on shows deep, muted colors glowing out of black, swaying between greens and blues and now and then going round every other color, and moves faster than before.
- A smart lock glows red while it is locked and green while it is unlocked.
- A click on a piece bound to something it cannot switch, like a camera or a thermostat, opens its dialog, where it used to do nothing.
- The air out of an air conditioner is a haze of many fine, soft specks that leave from its outlet, blue when cooling and red when heating, which blends into the room, where it used to be bright blue or orange puffs.
- A towel rail has an Off the floor setting for how high it hangs, and by default hangs half a meter higher than before.
- In a panel view, where there is nothing to scroll, the mouse wheel zooms the floorplan and a finger dragged up or down turns it.
- The view the card opens with always shows the whole home, whatever the card's shape: on a square or tall card the camera backs off along the saved angle until everything fits, and can still be zoomed and turned from there. On a card narrower than 600 px, as on a phone, the home is centered and fills the card with only a thin margin.
- A room flown to is fitted to the card the same way, with almost no margin: its saved view keeps its angle and backs off until the whole room shows, on a phone the room is centered and fills the card, and a room with no saved view is centered in the card. The camera flies straight to that view, and keeps the room fitted while the card changes size until it is turned, panned or zoomed.
- A second click on the floor of the room in view always takes the camera back to the whole home, even after turning, panning or zooming inside the room, where it used to fly back to the room's view.
- In the card's settings, pressing or changing the tiles of a room flies the preview to that room, and the Home tiles take it back to the whole home.
- A button, script or scene tile lights up when pressed, stays lit for half a second and then fades slowly back, and its Press pill does the same on its own.
- On a small tile, a pill that does something, like Press, is as wide as its words and sits at the right, as on a wide tile.
- The position tile of a blind, a shutter, a garage door or another cover that goes up and down fills from the bottom as it rises and is dragged up and down, an inverted one like a projector screen fills from the top as it comes down, and curtains, gates, doors and valves still fill from the left.
- A slider tile that is empty shows a faint handle at the side to pull it from, and the handles at both ends sit exactly halfway across the tile's padding.
- A thermostat's target temperature tile is always wide when it holds a range of two temperatures, since a small one had no room for them.
- A wide thermostat is three rows tall, with its mode buttons across from its name so the name and the state stay in the bottom left corner like on every other tile.
- A thermostat's modes tile is always wide, since a small one had no room for every mode.
- Temperatures on thermostats and dials show a degree sign, like 22°, and a thermostat's state reads as one phrase, like 20.5° to 22°.
- A thermostat's icon takes the color of the mode it runs in on every one of its tiles, and that color washes down from the top of the tile while it is on. In auto, or keeping a range, it takes the color of what it is doing, like orange while it heats, and no color while it waits.
- Each thermostat mode has its own color: orange for heating, blue for cooling, yellow for drying and teal for the fan alone, while auto and keeping a range look plain like off. Water heaters, humidifiers and the alarm panel's warning share the same orange and blue. In the 3D view, the air out of an air conditioner and the glow of a thermostat take the same color as its tiles.
- The side panel's tiles fade out at its top and bottom edges as they scroll, showing the background, instead of being cut off.
- The camera tile shows the camera's state under its name.
- Covers, vacuums, thermostats and media players are offered as a small tile that only answers a tap, as well as wide with their buttons.
- A calendar or a to-do list in the side panel shows as the calendar or the to-do card, and Floorplan Any Entity is no longer offered for a calendar.
- On a phone, the home and a room you fly to sit in the middle of the card and fill it, running a little past its sides rather than leaving empty space around them.

### Fixed

- A thermostat on auto with a single temperature shows the paler stretch and its arrows toward it from either side, where it showed none.
- Dragging a dial's knob or a slider no longer opens the card's dialog when it is let go.
- In a sections dashboard, a floorplan card with its side panel and a set number of rows keeps the tiles inside the card when they drop under the floorplan on a narrow screen, scrolling them there instead of covering the editor and the cards below.
- Adding an item to the to-do list card with Enter or the plus beside the field now adds it to the list.
- Buttons keep their fill and stay readable under the pointer, on a tile that is on or off and on a light or a dark dashboard.
- Colored icons, words and lines on the tiles, like the chosen mode, the Clear link of a to-do list or a light's icon, now stand out clearly from the tile in light and in dark, and the dimmer second lines are a little stronger.
- The editor's Discard changes dialog shows its buttons in their proper colors.
- When picking a device for a blind, window, projector screen or other piece, the devices of its own type are listed first, so a cover without a position is no longer lost among switches.
- A speaker, floor speaker or soundbar on pause stops sending out sound waves, and keeps its lights until it is switched off.
- A piece can be set on top of a basin, where it used to sink into it.
- Picking an option from a menu on a tile, like the mode of a humidifier, or typing an alarm code, no longer also turns the tile on or off.
- A small tile with a menu where nothing is chosen, like a fan running without a preset, now says what the menu picks instead of showing an empty pill.
- Without the side panel, the floorplan in a sections view with a set number of rows fills them instead of spilling over what is under it.

## [1.2.5] - 2026-10-08

### Changed

- On a light dashboard the home is lit brighter, so it no longer looks dark against a white background. The lighter the dashboard, the brighter the room, and dark dashboards look the same as before.

## [1.2.4] - 2026-10-03

### Added

- Every room has a view from the start: one with none saved is framed alone, from the same side as the view the card opens with, so a click on any room flies the camera to it. Forgetting a saved view, of a room or of the card, goes back to the one it comes with.

### Changed

- A click on a device now acts on it from anywhere by default. Set `first_click: room`, or switch the Click button in the editor's 3D view, to have the first click go to the device's room as before.
- Going from one room to another, the room left behind fades out while the new one fades in, for as long as the camera takes to fly there, where the change used to be over well before the camera landed.
- Floors that touch now meet with no gap, and a floor's edges and corners are rounded only where it stands free, top and bottom alike, with a wider rounding than before.
- A floor's boards and tiles are set off a little from the room's outline, so the sides of the floor take the color of a board or a tile, not of the joint between two.

### Fixed

- A door and a window stand exactly on the line between two rooms, as far into one as into the other, where they used to sit a little inside the room they were put in.
- After Save & Close in the editor, the Save button of Home Assistant's own dialog can be pressed to leave, where it used to be greyed out and only Cancel was left.
- The panels inside a kitchen counter no longer show through a sink set where two of its units meet.

## [1.2.3] - 2026-10-03

### Added

- A blind has an Other side of wall switch that hangs it on the far side of the wall it is on, outside the room it belongs to, which is where a shutter on an outside wall goes. It works whether or not there is a room on that side.
- A toaster has a Depth slider, and one made shallow enough has a single slot where it had two.
- A piece that can stand on others has an arrow down and an arrow up in its panel that step it through the heights there are where it stands: the floor, every top under it, and the height it has on its own. A piece sent down to the floor stays on it when dragged, so it can go under a table. A height set with the old slider is kept, as one of the steps.
- A window, a door, a sliding door or a garage door with no device and a blind or a curtain over it passes its clicks to that blind, so a click on the glass works the blind whichever side of the window it hangs on. With two blinds side by side over it, each part of the glass works the blind over it, and where a blind and a curtain hang over the same part the click goes to the blind.

### Changed

- With the camera on a room, a click on a door or a window with no device in one of its walls now takes the camera to the room on the other side, where it used to go back to the whole home. One with a blind or a curtain over it still works that blind.
- On a touch screen, a finger dragged up or down over the card scrolls the dashboard where it used to turn the home. Start the drag sideways to turn the home, and it tilts too for as long as the finger stays down.
- A door, window, blind, curtain or awning in a wall between two rooms now belongs to both: it stays in view and can be pressed when the camera goes to either room, whichever of the two it was put in. From the whole home, a click on it goes to the room it is looked at from, so turning the home round to see the door from its other side sends the click to the other room.

### Removed

- The Standing on slider and dropdown of the pieces that go on tables and counters are gone, replaced by the arrows above.

## [1.2.2] - 2026-10-03

### Added

- `aspect_ratio_mobile` gives the card another shape while it is narrower than 600 px, so one card can be 16:9 on a desktop and square on a phone.

### Changed

- The card has no background, border or shadow of its own any more: the home stands directly on the dashboard, in whatever theme it has, and fades away towards the card's edges where it used to be cut by them.
- A card that sets no `aspect_ratio` is now 16:9, and square while it is narrower than 600 px, where it used to be 4:3 at every width. A card that sets `aspect_ratio` keeps its shape.
- The first click on a device now goes to its room by default, when that room has a view, and the device answers once the camera is there. Set `first_click: device`, or switch the Click button in the editor's 3D view, to have devices answer from anywhere as before.
- The camera flies to a room, and back out of it, more than twice as fast.

### Removed

- The reset button in the card's bottom right corner is gone: a click on the empty space around the home takes the camera back to the opening view.

### Fixed

- A long press never sends the camera to a room or back home any more: on touch screens that call a long press early, holding a finger on a room's floor used to count as a click on it.
- A long press on a touch screen finds a device as far from the finger as a tap does, and opens its dialog where the browser's own menu used to get in the way.

## [1.2.1] - 2026-10-03

### Added

- The card can send the first click on a device to its room instead of the device, which then answers once the camera is in the room: switch it with the Click button in the corner of the editor's 3D view, or with `first_click: room`.

### Changed

- Clicking a room that has a view now fades the rest of the home away, so the room stands alone and only what is in it can be clicked, and clicking outside it brings the camera and the other rooms back.

## [1.2.0] - 2026-10-02

### Added

- The editor can show a picture of your plan under the drawing to trace the rooms over, as just its lines or faded as you like: choose it from the image button in the toolbar, click it to move and resize it to scale, show the whole picture or only its lines, and remove it when the rooms are drawn. The picture stays in your browser and is never saved with the card.

### Changed

- The furniture that stands for no device is drawn a room at a time instead of a part at a time, so the card moves more smoothly on a phone or a tablet and looks the same.
- A click or a tap near a device goes to the device, and only a press with nothing at all around it goes to the floor of the room. A tap with a finger reaches a little further than a click.

### Fixed

- The darkening at the corners of the card showed as rings of gray instead of a smooth shade.
- Flying to a room's view no longer starts with a jump: the camera moves in one continuous motion from where it stands to the view.
- On a dashboard scrolled down, a gesture with one or two fingers no longer opens with a leap of the camera, a sudden zoom, slide or tilt.
- The editor tab showed both the mouse controls and the finger gestures on many phones and tablets. It now shows the finger gestures on a device with a touch screen and the mouse controls on any other, never both.
- Many phones and tablets were drawn with the heavier settings meant for a computer, which made the card slower on them than it should be.
- The first time a light was switched on after the card opened, it came on late and the card stuttered, most of all on a phone or a tablet. It now comes on at once, as it did from the second time on.

## [1.1.0] - 2026-09-27

### Added

- The card's editor tab shows how to rotate, pan and zoom the view, with the mouse buttons or the finger gestures the device uses.
- Corners and edges where things meet are shaded darker, so the furniture sits in the room instead of floating on the floor.
- The corners of the card are darkened, to draw the eye to the home.
- A device that cannot keep up while the camera moves draws the picture a little softer, and goes back to full sharpness once it can.

### Changed

- A click on a piece that stands for no device does what a click on the floor of its room does: the camera flies to that room's view, or back to the opening view when it was already there.
- The space around the home is a dark gray instead of a dark blue.
- Daylight is dimmer, so the lamps still stand out during the day.
- Scrolling over the card no longer zooms it, so a page can be scrolled past it. The mouse zooms by dragging with the wheel pressed, and the wheel still zooms the editor's preview.
- Flying to a room seen from the other side of the home now goes round the home at the camera's height, taking a little longer, instead of swinging over the top and looking down.
- The card only redraws when something in it changes, a light, a door, the camera, so a still home no longer keeps the graphics chip busy or drains a tablet's battery.
- Rounded edges, lamp shades, cushions and rug fringes are built from far fewer triangles, which look the same at the card's size but draw much faster on a phone or a tablet.
- On a phone or a tablet only the two brightest lamps cast shadows, instead of four.

### Fixed

- Zooming by dragging with the wheel pressed follows the distance dragged instead of leaping on fast mice.
- Dragging with a finger turns the camera at half the speed it did, so a touch drag no longer spins the home around.
- A two finger gesture now either pans or zooms, chosen by how it starts, instead of doing both at once.
- Starting a pinch no longer jumps the camera back to its saved view.
- Turning a light on or off no longer freezes the card for a moment while the shaders for the new lighting are built.

## [1.0.1] - 2026-09-27

### Changed

- The card's background is always dark, whatever the Home Assistant theme, so the lights in the home stand out.

## [1.0.0] - 2026-09-27

### Added

- A 3D model of your home drawn from rooms you trace on a plan.
- A catalog of furniture, lights, appliances, doors, windows and sensors, each in several styles.
- Devices from Home Assistant bound to the pieces that stand for them, so a click on a piece controls the device and the piece shows its state.
- A visual editor inside the card's dialog: draw rooms, place and move pieces, bind devices, try states.
- Saved camera views: the one the card opens with and one per room that a click on its floor flies to. A second click on that floor, or a click on the empty space around the home, brings the camera back.

### Fixed

### Changed

[Unreleased]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.29...HEAD
[1.8.29]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.28...v1.8.29
[1.8.28]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.27...v1.8.28
[1.8.27]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.26...v1.8.27
[1.8.26]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.25...v1.8.26
[1.8.25]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.24...v1.8.25
[1.8.24]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.23...v1.8.24
[1.8.23]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.22...v1.8.23
[1.8.22]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.21...v1.8.22
[1.8.21]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.20...v1.8.21
[1.8.20]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.19...v1.8.20
[1.8.19]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.18...v1.8.19
[1.8.18]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.17...v1.8.18
[1.8.17]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.16...v1.8.17
[1.8.16]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.15...v1.8.16
[1.8.15]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.14...v1.8.15
[1.8.14]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.13...v1.8.14
[1.8.13]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.12...v1.8.13
[1.8.12]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.11...v1.8.12
[1.8.11]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.10...v1.8.11
[1.8.10]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.9...v1.8.10
[1.8.9]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.8...v1.8.9
[1.8.8]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.7...v1.8.8
[1.8.7]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.6...v1.8.7
[1.8.6]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.5...v1.8.6
[1.8.5]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.4...v1.8.5
[1.8.4]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.3...v1.8.4
[1.8.3]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.2...v1.8.3
[1.8.2]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/CarlesRojas/ha-diorama/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/CarlesRojas/ha-diorama/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.5...v1.3.0
[1.2.5]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/CarlesRojas/ha-diorama/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/CarlesRojas/ha-diorama/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CarlesRojas/ha-diorama/releases/tag/v1.0.0
