# Diorama tiles

Diorama comes with twelve small tiles and eight larger cards, to sit around the 3D model on the same dashboard. They are in the same `card.js`, so there is nothing more to install. The tiles are made for a sections view, and the diorama card can also lay them out beside itself in its [side panel](#side-panel).

| Card          | Takes                                                                                                               | A tap                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dio-title`   | nothing                                                                                                             | nothing, it is a heading                                                                                                                                                                                                                                                                                                                         |
| `dio-toggle`  | `light.*`, `switch.*`, `fan.*`, `input_boolean.*`, `humidifier.*`, `siren.*`, `remote.*`, `automation.*`, `valve.*` | toggles it, or opens or closes a valve                                                                                                                                                                                                                                                                                                           |
| `dio-button`  | `button.*`, `input_button.*`, `script.*`, `scene.*`                                                                 | presses it, or runs the script or scene                                                                                                                                                                                                                                                                                                          |
| `dio-cover`   | `cover.*`                                                                                                           | opens or closes it. Up, stop and down sit in the top right corner                                                                                                                                                                                                                                                                                |
| `dio-vacuum`  | `vacuum.*`                                                                                                          | starts or pauses it. The vacuum's buttons sit in the top right corner                                                                                                                                                                                                                                                                            |
| `dio-select`  | `select.*`, `input_select.*`                                                                                        | opens a menu of the options, or moves to the next one                                                                                                                                                                                                                                                                                            |
| `dio-camera`  | `camera.*`, `image.*`                                                                                               | opens the camera's dialog                                                                                                                                                                                                                                                                                                                        |
| `dio-climate` | `climate.*`, `water_heater.*`                                                                                       | opens its dialog. Minus and plus for the temperature it aims for, or for either end of its range, sit in the top right corner, and a wide thermostat or water heater is three rows tall, with a button for each mode it runs in across from its name, which stays in the bottom left corner. Temperatures read in degrees with no unit, like 21° |
| `dio-media`   | `media_player.*`                                                                                                    | pauses or plays what it has on, and switches it on and off while it has nothing on or cannot play and pause. Previous, play or pause, next, and a button to turn it off sit in the top right corner                                                                                                                                              |
| `dio-lock`    | `lock.*`                                                                                                            | locks it, or unlocks it while it is locked. It turns green while it is not locked, and has a red icon and a red wash while it is locked                                                                                                                                                                                                          |
| `dio-weather` | `weather.*`                                                                                                         | opens its dialog. It takes the whole width and three rows, and shows the next hours or days                                                                                                                                                                                                                                                      |
| `dio-entity`  | any entity                                                                                                          | opens its dialog. The line under the name is its state, with its unit                                                                                                                                                                                                                                                                            |

The buttons in the top right corner show on a small tile too, with some room left between them and the icon. When the tile is too narrow for both, the icon makes way for the buttons, and when it is too narrow even for them alone they shrink until they fit, so they never go away. Buttons beside the icon from a `feature`, like a vacuum's commands, take the icon's place the same way.

The larger cards are offered beside the tiles when a card is added by entity:

| Card                | Takes                                                                                                    | What it shows                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `dio-alarm-panel`   | `alarm_control_panel.*`                                                                                  | a button for each mode it arms in and a keypad for its code                                                                       |
| `dio-dial`          | `climate.*`, `water_heater.*`, `humidifier.*`, and `light.*` that dims                                   | a ring to drag to the temperature, humidity or brightness it aims for, with plus over minus on its left, and its modes            |
| `dio-media-control` | `media_player.*`                                                                                         | what is playing over its cover art, or with the art in place of the icon, its buttons and its volume, filling as the song goes on |
| `dio-remote`        | `remote.*`, and `media_player.*` of a TV                                                                 | back, home and power in the top right, minus, mute and plus beside them, and a round pad of arrows around OK                      |
| `dio-calendar`      | `calendar.*`                                                                                             | the events of the next days, as a list by day across the card, or only today's                                                    |
| `dio-todo`          | `todo.*`                                                                                                 | the items to do with a box to tick each and the done items, with a plus that opens a field to add one                             |
| `dio-graph`         | `sensor.*`, `binary_sensor.*`, `counter.*`, `input_number.*`, `number.*`, `person.*`, `device_tracker.*` | a line over the last day, bars for the last days, or a strip lit for the times it was on                                          |
| `dio-gauge`         | any entity with a number for a state                                                                     | the reading, and a small ring as full as it is between its minimum and maximum                                                    |
| `dio-map`           | `person.*`, `device_tracker.*`, `zone.*`                                                                 | where it is, on Home Assistant's own map                                                                                          |

Every larger card is laid out like a wide tile: the icon in the top left, its buttons and modes in the top right, the name and the state in the bottom left, and what it shows in the bottom right, taking no more room than it needs. A tap opens the entity's dialog, except on a light's or a humidifier's dial, where it turns it on or off, on Now Playing, and on a TV remote, where a tap around the keys does nothing. Dragging a ring or a slider, or pressing minus, plus or a mode on a card or a tile, never also opens the dialog. A long press always opens the dialog. A dial fills on the same side as Home Assistant's: from its start up to the knob to heat, to humidify, for a water heater or a light, from the knob to its end to cool or for a dehumidifier, and all the way round on auto or in modes like dry or fan only. A thermostat that only heats or only cools fills as it would doing that while it is off or on auto. While the room is on its way to a dial's knob, the stretch of the ring from where the room is now to the knob is paler, with arrows close together along it that point at the knob and light up one after another toward it. A stretch too short to show an arrow past the knob starts a little further back, so at least one always shows. A thermostat's range of two temperatures fills like Home Assistant's, from the ring's start up to its low end in the heating color and from its high end on in the cooling color, with the stretch and its arrows in the color of the end the room is heading for. A range on anything else fills between its ends. A range shows the stretch only while the room is outside it, and a single value only while the room is on the side the ring fills, like below it to heat or above it to cool, or on either side for a thermostat on auto, whose ring then fills all round but for the stretch. With no stretch, a small dot on the ring marks where the room is now, unless that is where a knob is, so a dial shows either the dot or the arrows and never both.

The alarm panel is one wide tile: its modes in the top right like a thermostat's, and for an alarm with a code a keypad on the right with what to do said large on the left, like Tap a mode to arm. Disarmed, a tap on a mode that needs a code picks it, pulsing, and the keys wake for the code; the key right of the zero then sends it, a red lock to arm. Armed, the modes are off and the code alone disarms it, sent with a green open lock. A green wash comes in from the left while it is disarmed and a red one while it is armed.

Most tiles can also show a control in the top right corner beside the icon, set with `feature`, so the tile stays two rows tall: favorite colors or an effect for a light, a fan's speeds as buttons or a menu, its direction, oscillation or preset, a cover's favorite positions, tilt or buttons, a thermostat's modes, presets, fan or swing, a water heater's modes as buttons or a menu, a target temperature or humidity, a media player's playback, volume buttons, source or sound mode, an alarm's modes, a vacuum's or a lawn mower's commands, a counter's or a timer's buttons, a number, a date or an option list. The card editor lists the ones the entity can do, and the card picker offers a tile with each of them. Picked from an entity it is named by a word or two after the card's name, as in Diorama Toggle - Color, while in the list of every card, and in the widget picker, it is a card of its own, Diorama Toggle with Color or Toggle with Color, that adds the plain card set up that way for the first entity that can be. A small tile drops what has no room there, like the word on the oscillate pill or the colors past the fourth, and a few controls with too many buttons for it, favorite positions and tilts, an alarm's modes, a vacuum's commands, a thermostat's modes and its target temperature when it is a range of two, and a fan's speed buttons when it has more than two speeds, always make the tile wide. A wide thermostat with a control beside its icon has no modes across from its name. A light's `brightness`, a fan's `speed`, a humidifier's `humidity-slider`, a thermostat's or a water heater's `temperature-slider`, a media player's `volume-slider`, a cover's or a valve's `position` or `tilt-position`, and a number's `numeric-input` when it can be a slider make the whole tile a slider: it fills from the left as far as the light is bright, the fan is fast, the humidifier aims for, the temperature a thermostat holds is along its range, the player is loud, the cover is open or the number is along its range, a drag sideways anywhere on it follows the finger, the left and right arrows do the same from the keyboard, and a tap still turns it on or off, plays or pauses a media player, opens or closes a cover, or opens a number's dialog. A thermostat's or a water heater's tap still opens its dialog, and down to nothing turns it off. A number with too many steps for a slider, or set to a box, has minus and plus beside the icon instead. A sensor's `bar-gauge` fills the whole tile from the left as far as its percentage, like a battery's charge, with nothing to drag, and a tap opens its dialog. A cover that goes up and down, like a blind, a shutter or a garage door, fills from the bottom instead as it rises and is dragged up and down, or moved with the up and down arrows. An inverted one, like a projector screen, fills from the top as it comes down. A cover or a valve always fills as far as it really is: a drag lays a paler band from there to the finger, which stays where it was let go while the fill glides to meet it, and fades once the fill gets there or has stood still for three seconds. Meanwhile a curtain, a gate, a door, a valve and the tilt of slats still fill from the left. A faint handle sits at the end of a full tile, and at the start of an empty one to show where to pull it from, halfway across the padding. A fan with a few speeds moves freely under the finger and settles on the nearest speed when it lifts. A light's `color-temp` and `color` are a slim bar beside the icon, at every size, with a round handle: a press on the bar jumps there and a drag follows the finger, while the line under the name says the temperature or hue and the tile takes that color, until the light answers, and a tap anywhere else still turns the light on or off. While the light is on, that line says its white in kelvin or the name of its color, like Orange, in place of its brightness, and the tile shines in it. Both follow the mode the light is in: a light shining in a color says its brightness on a temperature tile, whose handle then shows faint, and the same for a white on a color tile. A fan's oscillation is a pill that fills in while it oscillates, or will once the fan is on. A lock's `open-door` makes the whole tile open the door, in two taps: the first lights half of it in white, with no green yet, which runs back to nothing over four seconds, and a second tap before then lights it all, fades the green in and opens the door. While the door is open, one tap locks it again. In the card picker it is Diorama Lock - Door Opener, or Diorama Lock with Door Opener in the list of every card.

On every tile but the title, a long press or a right click opens Home Assistant's more info dialog for the entity. With a keyboard, Enter or Space taps and the context menu key or Shift+F10 holds.

Every tile can be set up from Home Assistant's visual card editor, as well as in YAML.

A tile that is on is light and opaque with its icon in color. On a light dashboard it is dark instead, with white text, so it still stands out from the page. A light that is on tints its icon and the top left of its tile with the color it shines in. One that is off is frosted glass. One whose entity is unavailable is dimmed, says so, and does nothing when tapped.

## Example

```yaml
type: dio-toggle
entity: light.living_room
name: Ceiling
icon: ph:lamp-pendant
size: small
```

## Options every tile takes

| Key            | Default             | Description                                                                                          |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `entity`       |                     | The entity, required on every tile but the title                                                     |
| `name`         | its friendly name   | The name on the tile                                                                                 |
| `icon`         | one for its domain  | A Phosphor icon as `ph:<name>`, see below, or any icon Home Assistant knows, such as `mdi:lightbulb` |
| `color`        | the domain's accent | Any CSS color, for the icon while the tile is on                                                     |
| `state_text`   |                     | Replaces the line under the name                                                                     |
| `size`         | `small`             | `small` is half of a section's width, `wide` is all of it                                            |
| `area`         | the entity's area   | The area the tile belongs to for the room filter, as its id or its name                              |
| `never_hide`   | `false`             | Keeps the tile showing whatever room is in view, see [Room filtering](#room-filtering)               |
| `room_filter`  | `hide`              | How the tile follows the room in view, see [Room filtering](#room-filtering)                         |
| `tap_action`   |                     | Replaces what a tap does, in the format Home Assistant's own cards use                               |
| `hold_action`  | `more-info`         | Replaces what a long press does                                                                      |
| `haptic`       | `true`              | `false` turns off the short vibration the companion app gives on a tap                               |
| `confirm`      | `false`             | On a toggle or a button, acts only on a second tap, so a stray one does nothing                      |
| `grid_options` |                     | Home Assistant's own, to give the tile a size of your own in the section grid                        |

`tap_action` and `hold_action` take `action` as one of `toggle`, `more-info`, `navigate` with `navigation_path`, `url` with `url_path`, `perform-action` with `perform_action`, `data` and `target`, or `none`. Add `confirmation: true` to ask first.

```yaml
type: dio-button
entity: script.good_night
tap_action:
  action: perform-action
  perform_action: script.turn_on
  target:
    entity_id: script.good_night
  confirmation:
    text: Turn everything off?
```

## Each card's own options

`dio-title`

| Key     | Description                                                                   |
| ------- | ----------------------------------------------------------------------------- |
| `title` | The heading. Without one, the name of its `area`                              |
| `area`  | The area the heading belongs to, so it hides with the room filter like a tile |

`dio-cover`

| Key      | Default | Description                                                                                                             |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `invert` | `false` | Swaps what up and down do, for a projector screen or a blind wired the other way round, where closing it brings it down |

The buttons are never greyed out, since many covers do not know where they are. While a cover is partly open, its position is shown next to its state. A cover's `position-buttons` feature makes the whole tile its position slider, as `position` does, and keeps the up, stop and down buttons in its top right corner. A press on a button never starts a drag.

`dio-vacuum`

| Key              | Description                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `battery_entity` | A sensor with the battery level, for a vacuum that does not report it. Without one, a battery sensor on the vacuum's own device is used |

The tile shows pause or start, stop, and back to the dock, each only when the vacuum supports it.

`feature`, on any tile, is the id of the control under its name, as the card editor and the card picker set it.

`dio-graph`

| Key     | Default | Description                                                     |
| ------- | ------- | --------------------------------------------------------------- |
| `chart` | `line`  | `line` for the last hours of a reading, `bar` for one bar a day |
| `hours` | `24`    | How far back a line or a strip reaches                          |
| `days`  | `7`     | How many days of bars                                           |

`dio-gauge` takes `min` and `max`, and `dio-calendar` takes `entities`, more calendars to list along with its own, and `days`, how many days ahead it lists, where `1` lists only today's events. The list runs across the whole card, from under the icon down to just over the name. Each day starts with its all day events as plain grey round pills with just their names, then the rest with their times, each tinted in its calendar's color, which is set by the calendar's place in the list: teal, blue, orange, purple, pink and yellow. `dio-map` takes `hours_to_show`, how many hours of a person's path it draws behind them, and `layout`: `full`, the default, spreads the map over the whole card with the name and place in white over a shade in the bottom left, and `top` runs the map across the top of the card inside its margins with the name and place in a bar below. Neither shows an icon, and the map centers on the person or the place it shows. `dio-weather` takes `forecast_type`, `hourly` or `daily`, and `size`: `small` makes it half as wide and two rows tall with only the weather now, the sky, the high and the low, and `large` makes it six rows tall, with the next hours and under them the next days, each with its low and high on a bar across the week's range and today's with a dot for the temperature now. `dio-media-control` takes `art`, `background` to wash the cover art, lightly blurred so it can still be made out, behind the whole card, the default, or `icon` to show it square in place of the icon, as large as the card leaves it above the title, its corners rounded to match the card's. The card is as tall either way. Either way the card fills from the left with a faint dark shade as far into the song as it is, `--dio-media-progress` in a theme sets that shade, and the time played sits beside the buttons. A sideways swipe anywhere on the card, away from the volume and the buttons, seeks when the player can, and a tap plays or pauses it. It only plays what is on, so it has no power button and a tap while it is off does nothing. While it is off, play still shows, greyed out, so the card does not look like a toggle. A player that only assumes its state, like a TV box driven as its remote, cannot tell what plays in it, so while another player of a device with the same name, like the one the box casts from, is playing or paused, the card takes from it what plays, whether it is paused, and which buttons the app takes, so an app that never skips shows no previous or next. An app that says it plays even while paused, and tells neither how far in nor how long it is, like Netflix, gets one button that plays or pauses, as the box cannot tell which it will do. Its buttons still go to the player itself when it can take them, so they work even before anything plays. The card is offered only for a player that can play, pause, skip or change its volume, and not for one that can only browse or search. The volume across from the title fills in the card's own text color, white on a dark card and black on a light one, with shuffle and repeat to its right. A player that gives Not Provided as the title, like a speaker playing from a phone, shows its own name with Not Provided under it. Playing from a well known app with no cover art, like Netflix or YouTube on a TV, the card shows the app's logo in place of the icon, a logo in a single color made white, and a soft light in the app's colors drifts slowly behind the card, holding still while paused. The lights fade into a dark shade of the app's color rather than the plain card, on a light theme as well as a dark one, so the whole card looks lit, with its words and logo in white. Any other app gets the same light in quieter colors and keeps the icon. The card can be made as short as two rows or as narrow as half the width, in Home Assistant's grid or the side panel's: either way it leaves out the volume, shuffle and repeat and keeps its buttons and the time played in the top right. Half as wide, it also leaves out the icon or the art in the top left, so the buttons fit. The title always takes one line, cut short with an ellipsis. Under the title it says the series of an episode, the artist of a song or the channel of a video, or else the album, or else the app, and On when it knows none of them. The TV in the model says the same.

`dio-remote` is a TV remote. It works as it is for a remote or a TV from the Android TV Remote, Android Debug Bridge, Roku, Samsung, Philips, Sony Bravia and LG webOS integrations: it reads which integration the entity comes from and sends each key by the name that integration gives it. A TV's player can be picked too, and the card then finds the remote of the same device. It is only offered for one of those. The volume keys repeat while held. `volume_entity` sends the volume and mute to another player instead, like the TV a streaming box is plugged into, and mute stays pressed while it is muted. The round pad works like a touch surface: a tap anywhere on it is OK, and a swipe steers it like a stick, sending that arrow at once, then after three quarters of a second and a little sooner each time, up to four a second, while the finger stays down, and turning when the finger moves far enough another way. Nothing lights under the finger: OK pulses the whole pad and each arrow sent pulses a round behind it, and the arrows are dimmer than OK. While the remote is off, every key but power is greyed out, since any other key would wake it and the TV with it. The volume keys of a streaming box only reach the TV when the box is set to control it, so give it `volume_entity` when they do nothing. Power turns it on with one press, but turns it off only with a second press within three seconds, while the light on it runs back, so it is never turned off by mistake. `power_entity` has power turn that entity on and off in its place, like a toggle or a script that also readies the room, while the state shown stays the remote's own. `power: false` leaves the power key out, and the side panel does that on its own when the same entity also has a `dio-toggle` there. `commands` gives any key a command of its own, for any other remote: the name of a command its remote sends, or an action with its data. The keys are `up`, `down`, `left`, `right`, `ok`, `back`, `home`, `mute`, `volume_up`, `volume_down` and `play`, which plays or pauses and is used by `dio-media-remote`, and a key with no way to send it is greyed out. It takes the whole width and four rows, with the pad under back and home on the right and the volume standing on its left, and the name and the state never cut short, or half the width and six rows, with the pad and then the volume under them in the middle.

`dio-media-remote` is `dio-media-control` with the remote under it, always the whole width. While off it is two rows with only its icon, name and state, and a double tap turns it on. It grows to four rows at once, without waiting for the player, its buttons fade in and what plays comes in behind them: the title in place of the name, back, home and power in the top right, power turning it off on a second press, and the buttons that play over the volume, left of the pad. It finds the remote of the same device like `dio-remote`, and takes `commands`, `volume_entity` and `power_entity` the same way for a player whose remote is elsewhere, like a universal player. Play and pause go as the remote's play key when it has one, or the `play` command, since some apps cast to a box ignore a pause sent to the player. On a phone, where the name has no room beside the volume, the buttons that play and the volume stand at the top on the left with the name under them. Turned on from the card, it scrolls into view once it has grown.

```yaml
type: custom:dio-remote
entity: remote.living_room
volume_entity: media_player.living_room_tv
commands:
  home: KEY_HOME
  ok:
    action: script.press_ok
```

`dio-select`

| Key            | Default | Description                                                               |
| -------------- | ------- | ------------------------------------------------------------------------- |
| `tap_behavior` | `menu`  | `menu` opens the options under the tile, `cycle` moves to the next option |

`dio-camera`

| Key            | Default | Description                                                                       |
| -------------- | ------- | --------------------------------------------------------------------------------- |
| `camera_view`  | `auto`  | `auto` shows a still that refreshes, `live` streams                               |
| `aspect_ratio` | `16:9`  | The picture's shape, as `width:height`. Ignored when `grid_options` sets the rows |

## Side panel

The diorama card can bring its own tiles. Turn on **Show widgets beside the 3D view** in the card's settings, or set `side_panel: true` in its YAML, and the diorama takes the left two thirds of the card with its tiles on the right third. When the card is narrower than 900 pixels, the tiles go under the diorama instead. This works in any view. In a panel view the diorama fills its column from the top of the screen to the bottom, whatever its `aspect_ratio`. On a phone it is square, with the tiles under it. In a sections view the card takes the full width of its section.

The card also lays a background behind the view it is in, graphite by default. The card's editor has a Background section with a row of swatches for a light dashboard and another for a dark one, so each can have its own: graphite, dusk, ocean, forest or ember, each a dark version and a pale version of the same colors, or Plain to keep the dashboard's own background. Above them, **Use a background** turns it off altogether, hiding the swatches and leaving the dashboard's own background in both. In YAML that is `show: false`, and the colors picked stay for when it is turned on again:

```yaml
background:
  light: dusk
  dark: ocean
```

The tiles fill themselves from the plan. Each room gets a heading with its name, then a tile for each device placed in it, in the order the plan lists them. Each device gets the tile made for its domain, a calendar the calendar card, a to-do list the to-do card, and `dio-entity` when none is. Covers, vacuums, thermostats and media players are wide. The icon comes from the piece the device stands behind, so a pendant lamp shows `ph:lamp-pendant`, and a projector screen's tile is inverted. With the whole home in view every room shows, and with a room in view only that room does. When the room in view changes, the tiles fade out and the next ones fade in. While every tile is hidden the panel reads Nothing to control here.

Entities with no piece on the plan, like a scene, a sensor, a thermostat or a media player, can join a room's tiles too. Under the side panel switch in the card's settings, **Edit widgets** opens a page with the panel as it will look: the home's section, then each room, its name as a big heading that can be typed over to rename it, with arrows across from it that move the room up or down the panel, never above the home's section, its tiles laid out as the panel shows them, on the same twelve columns, and an Add entity button under them. Back returns to the settings. In YAML the rooms' order is the card's `room_order`, a list of room ids, and a room it leaves out follows the rest in the plan's order. An entity can be in one place only, so the picker leaves out every entity the plan or another room already has. They get the same tiles as the devices on the plan. In YAML they are the room's `entities`. An entity added this way has a cross in its tile's top right corner that takes it out again. A device on the plan has an eye there instead, which hides its tile from the panel. It leaves the grid for a row of its own above Add entity, whose eye puts it back. In YAML the hidden ones are the room's `hidden`, a list of entity ids.

Dragging a tile moves it, the others sliding out of its way, and the panel shows the room's tiles in that order. With a tile focused, the arrow keys move it too. In YAML the order is the room's `order`, a list of entity ids. An entity it leaves out goes after the ones it names.

```yaml
type: custom:diorama-card
side_panel: true
rooms:
  - id: living
    name: Living room
    area_id: living_room
    points: [[0, 0], [5, 0], [5, 4], [0, 4]]
    entities:
      - scene.movie_night
      - climate.living_room
    order:
      - climate.living_room
      - light.living_room
      - scene.movie_night
```

Some tiles are for the whole home rather than a room, like a scene that sets up the bedroom for the projector, a switch that turns every light off, or the weather. Put them under the Home heading at the top of the Edit widgets page. It takes any entity, shows the same tiles as the rooms, and they are moved, resized and taken out the same way. Its heading reads Home and can be typed over to rename it. With any entity there, the panel shows only this section while the whole home is in view, and each room's tiles only while that room is. With none, every room shows as before. To keep every room's tiles under the home's with the whole home in view, turn on **Show all widgets on the home view** in the settings. A room in view still shows only its own. In YAML it is the card's `home`, with an optional `name`, its `entities` in the order they show, and `show_rooms: true` for that switch.

```yaml
type: custom:diorama-card
side_panel: true
home:
  name: Home
  entities:
    - switch.projector_scene
    - switch.tv_scene
    - switch.all_lights
    - switch.cleaning
    - weather.home
rooms:
  - id: living
    name: Living room
    area_id: living_room
    points: [[0, 0], [5, 0], [5, 4], [0, 4]]
```

The pen in each tile's top left corner opens a picker in its place. It shows every diorama card the entity can be, each set up every way it can be, like a light as a toggle, with a color bar, with color buttons, as its state alone or as a big dial, live with the entity's state and at the size it takes in the panel, with a short name under each, like Double Tap Toggle or Toggle with Favorite Colors. A media player that is off shows as if it were playing a song, so its buttons and progress can be seen. The one the panel picks for the domain is marked Auto. A tap on a card makes it the entity's only tile. More than one can be shown, like a TV's on and off and its volume buttons: the gray plus in the top right corner of a card adds it to the ones already there, so the entity gets a tile for each in the panel, which are moved and resized one by one. A card shown has a blue tick there instead, which takes it away again, but for the last one left. Done, at the foot of the page, or Back, goes back to the widgets. The handle in each tile's bottom right corner sets its size by dragging: sideways it steps through the widths the card comes in, like a toggle half or the whole width of the panel, and stretches any card that has no setup across the whole width, or narrows one that can be narrower, like Now Playing down to half, written as its `grid_options.columns`. A tile against the right side of the panel takes the whole width when the handle is pulled past the panel's edge. Once it takes the whole width, down makes it taller, up to twelve rows, and up shorter, never shorter than it is by itself unless it can be, like Now Playing down to two rows, written as its `grid_options.rows`, so a camera can be made square. In YAML the choice is in the room's or the home's `tiles`, by entity id, each the card's config without its entity, or a list of them for an entity with several tiles. A room's `order` and the home's `entities` then name that entity once for each of its tiles, in the order they show.

```yaml
home:
  entities:
    - light.living_room
  tiles:
    light.living_room:
      type: custom:dio-dial
rooms:
  - id: living
    name: Living room
    points: [[0, 0], [5, 0], [5, 4], [0, 4]]
    tiles:
      light.floor_lamp:
        type: custom:dio-toggle
        feature: color-favorites
```

At the top of the same page, **Name** and **Icon** set what that widget shows in place of its entity's own, so a script called `script_downstairs_lights_dining` can read Dining, with a fork and knife. The icon opens the bundled `ph:` icons, which a search narrows down by name, and takes any icon Home Assistant knows written in full, like `mdi:silverware`. **Default** goes back to the entity's own icon, and an empty name to its friendly name. They belong to the widget whose pen opened the page, and stay with it when another card is picked for it. In YAML they are the `name` and `icon` of the widget's card in `tiles`.

```yaml
home:
  entities:
    - script.script_downstairs_lights_dining
  tiles:
    script.script_downstairs_lights_dining:
      type: custom:dio-button
      name: Dining
      icon: ph:fork-knife
```

With `confirm: true`, a toggle or a button acts only on a second tap, as a lock opens the door, with no green or red. On a tile that is off, the first tap lights half of it, which runs back to nothing over four seconds, and a second tap before then lights it all and turns it on or runs it. On a toggle that is on, the first tap cuts the lit part back to half, which grows back to all of it over four seconds, and a second tap turns it off. A toggle set to two taps has no slider or other control, only on and off. A media player that can be turned on and off, like a TV, can be a toggle too, but only set to two taps, so it is never turned off by mistake, and it is on whatever it is doing. In the card picker it is Diorama Toggle - Double Tap, or Diorama Button - Double Tap, and in the list of every card Diorama Double Tap Toggle or Diorama Double Tap Button, as in the widget picker.

A scene or a script runs on a tap. An automation is a toggle that turns the automation itself on or off, so to run one from a tile, put its actions in a script. A light group made with Home Assistant's Group helper is a light, so its tile has brightness and color. While it is on, its toggle tile says how many of its lights are on, like 3 on, and its dial says it under the brightness. For a plain on and off over many lights, make a template switch instead, like the demo's All lights: on while any light is, and a tap turns them all off, or all on when every one is off. A scene in Home Assistant has no on or off, so for one that shows whether it is in place and undoes itself, make a template switch: its state says when the scene is on, `turn_on` sets it up and `turn_off` undoes what should be undone. The demo's Projector scene is on while the projector screen is down, turns off the bedroom lights and brings the screen down when turned on, and only rolls the screen up when turned off.

To lay the tiles out yourself, leave the side panel off and put the tiles next to the diorama card in a sections view.

## Icons

`ph:` icons come from [Phosphor](https://phosphoricons.com) and are built into the card, so they show offline. A tile that is on shows the filled weight of its icon and one that is off shows the regular one. Add `-fill` to a name, as in `ph:heart-fill`, to always show it filled. `ph:minus-bold`, `ph:plus-bold` and `ph:power-bold` are the heavier weight, and `ph:robot-vacuum`, a round robot vacuum, is drawn for the card.

These are included:

alarm, armchair, arrow-line-down, arrow-line-up, bathtub, battery-charging, battery-empty, battery-full, battery-high, battery-low, battery-medium, bed, bell, broom, calendar-blank, camera, caret-down, caret-left, caret-right, caret-up, cat, cell-signal-full, cell-signal-high, cell-signal-low, cell-signal-medium, chat-circle, check, circle, clock, cloud, cloud-fog, cloud-lightning, cloud-rain, cloud-snow, cloud-sun, cooking-pot, couch, cursor-click, desktop, door, door-open, download, drop, drop-half, eye, fan, film-strip, fire, fork-knife, garage, gauge, globe, hand-tap, hash, heart, house, house-line, lamp, lamp-pendant, lightbulb, lightbulb-filament, lightning, list, list-bullets, list-checks, lock, lock-open, map-pin, map-trifold, minus, monitor, moon, moon-stars, music-notes, oven, pause, paw-print, person, person-simple-walk, pipe, plant, play, plug, plugs, plus, popcorn, potted-plant, power, projector-screen, pulse, question, robot, rows, security-camera, shield, shield-check, shower, siren, skip-back, skip-forward, sliders, sliders-horizontal, snowflake, sparkle, speaker-high, spray-bottle, square-half-bottom, star, stop, sun, television, textbox, thermometer, thermometer-simple, timer, toggle-left, toggle-right, toilet, tree, user, video-camera, warning, wifi-high, wind, x.

The same icons are offered as `ph:` in Home Assistant's icon picker, and can be used on any card, unless another `ph` icon set is already installed.

A tile with no `icon` of its own shows the icon set for its entity in Home Assistant, in the entity's settings or its YAML, so a scene switch or a script can show a projector or a television. Pick a `ph:` icon there to match the other tiles. With none set, a tile on the plan shows the icon of its piece, and any other the one for its kind of entity.

A name not in the list shows a question mark and logs a warning in the browser console. Any other icon is one `mdi:` name away.

## Room filtering

The side panel of a Diorama card always follows the room the card flies to. The Diorama tiles elsewhere on the dashboard stay as they are, unless **Hide other rooms' tiles** is on in the card's editor, `filter_tiles: true` in its YAML. Then, when the card flies to a room, every tile that belongs to another area hides, and a section left with nothing showing folds away. Going back to the whole home brings them all back. The room needs an area: set it in the editor, or as `area_id` on the room in the card's YAML. With it off, the tiles act as if the whole home were always in view.

A tile's area is its `area` option when it has one, else its entity's area, else the area of the entity's device. A tile with no area at all hides while a room is in view, and the browser console lists every such tile once. Give it an `area`, or `never_hide: true` to keep it in every room. A title with an `area` hides along with its tiles.

To keep one tile showing whatever room is in view, turn on **Never hide** in its editor, `never_hide: true` in its YAML.

`room_filter` takes one of these:

| Value  | The whole home | A room in view                                   |
| ------ | -------------- | ------------------------------------------------ |
| `hide` | shown          | shown in its own room. A tile with no area hides |
| `show` | shown          | shown, like `never_hide`                         |
| `room` | hidden         | shown in its own room only                       |
| `home` | shown          | hidden                                           |

`room` and `home` together make a panel that changes with the room: each room's tiles with `room`, and what is for the whole home with `home`. A room in the diorama with no area hides the `room` and `home` tiles and leaves the rest as they are.

While the dashboard is being edited, every tile shows whatever room is in view.

The card tells the page which room is in view through a `dio-room-filter` event on `window`, with `{ area_id, room_id, tiles }` as its detail, where `tiles` says whether the dashboard's tiles follow it, or `null` for the whole home. The last one is kept in `window.__fpRoomFilter`. Other cards can listen for it too.

## Theme

[themes/diorama-glass.yaml](../themes/diorama-glass.yaml) is a Home Assistant theme to go with the tiles: a dark gradient behind the dashboard, and the dashboard's own colors and dialogs set to match. Copy it into the `themes` folder of your Home Assistant config, with this in `configuration.yaml`:

```yaml
frontend:
  themes: !include_dir_merge_named themes
```

Then pick **Diorama Glass** in your profile, or as the dashboard's theme.

The tiles look finished without it, and change with any theme that sets these:

| Token                          | Default                    | What it changes                                                                   |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------------- |
| `dio-tile-radius`              | `30px`                     | The corner radius                                                                 |
| `dio-tile-padding`             | `18px`                     | The space inside a tile                                                           |
| `dio-tile-gap`                 | `10px`                     | The space between tiles, used by the theme                                        |
| `dio-tile-bg-active`           | `rgba(255, 255, 255, .94)` | The background of a tile that is on, `rgba(28, 28, 30, .94)` on a light dashboard |
| `dio-tile-bg-inactive`         | `rgba(118, 118, 128, .24)` | The background of a tile that is off                                              |
| `dio-tile-blur`                | `24px`                     | How much the glass blurs what is behind it                                        |
| `dio-tile-shadow`              | `none`                     | A box shadow under every tile                                                     |
| `dio-tile-opacity-inactive`    | `1`                        | The icon and text of a tile that is off                                           |
| `dio-tile-opacity-unavailable` | `.45`                      | A tile whose entity is unavailable                                                |
| `dio-tile-icon-size`           | `28px`                     | The icon                                                                          |
| `dio-tile-name-size`           | `15px`                     | The name                                                                          |
| `dio-tile-state-size`          | `13px`                     | The line under the name                                                           |
| `dio-slider-handle`            | the lit tile background    | The round handle of a slim slider beside the icon                                 |
| `dio-tile-duration`            | `200ms`                    | How long a tile takes to change                                                   |
| `dio-tile-press-scale`         | `.96`                      | How far a tile shrinks while pressed                                              |
| `dio-tile-focus-scale`         | `1.03`                     | How far a tile grows while in focus from the keyboard                             |
| `dio-text-active`              | `#1c1c1e`                  | The text on a tile that is on, `#ffffff` on a light dashboard                     |
| `dio-text-inactive`            | `#ffffff`                  | The text on a tile that is off                                                    |
| `dio-text-secondary-opacity`   | `.72`                      | The line under the name                                                           |
| `dio-accent`                   | `#0a84ff`                  | The icon of an `input_boolean`, script or select that is on                       |
| `dio-accent-light`             | `#ffb340`                  | The icon of a light or a switch that is on                                        |
| `dio-accent-cover`             | `#32ade6`                  | The icon of an open cover                                                         |
| `dio-accent-media`             | `#0a9a7c`                  | The icon and the volume of a media player that is playing                         |
| `dio-accent-climate`           | `#ff6422`                  | A water heater that is on, and the heating mode unless it is set                  |
| `dio-accent-cool`              | `#5ab0ff`                  | A humidifier, and the cooling mode unless it is set                               |
| `dio-mode-heat`                | `dio-accent-climate`       | A thermostat that heats                                                           |
| `dio-mode-cool`                | `dio-accent-cool`          | A thermostat that cools                                                           |
| `dio-mode-dry`                 | `#ffc60a`                  | A thermostat that dries the air                                                   |
| `dio-mode-fan`                 | `#30c9a4`                  | A thermostat that only runs its fan                                               |
| `dio-accent-unlocked`          | `#46c46e`                  | A lock that is not locked, its icon and the wash from its left                    |
| `dio-accent-locked`            | `#ff453a`                  | A locked lock, its icon and the wash from its left                                |
| `dio-font-tile`                | Inter                      | The tiles' font                                                                   |
| `dio-font-title`               | Inter Tight                | The headings' font                                                                |
| `dio-title-size`               | `30px`                     | The headings' size                                                                |
| `dio-title-opacity`            | `.92`                      | The headings' opacity                                                             |
| `dio-title-color`              | the theme's text color     | The headings' color                                                               |
| `dio-menu-bg`                  | dark frosted glass         | The select tile's menu                                                            |
| `dio-menu-text`                | `#ffffff`                  | The text in that menu                                                             |

On a light dashboard, a tile that is off is lighter glass with dark text, unless the theme sets its own.

The accent and mode colors are drawn lighter on a dark tile and deeper on a light one, so an icon or a line stands out at least three to one from its tile and words at least four and a half to one.

The fonts load from Google Fonts. Without a connection the tiles fall back to the system font.
