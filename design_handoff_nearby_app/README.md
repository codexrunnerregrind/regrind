# Handoff: Nearby — mobile app redesign

## Overview

A redesign of a location-based gay dating/hookup app (Grindr-style). Thirteen screens: a nearby feed, your own profile, someone else's profile, a saved/"Interest" grid with private notes, an inbox, a chat thread, settings (dark and light), a full-screen album viewer, the inbox Albums tab, an album editor, blocked users, and the Interest · Views list.

The redesign keeps the app's existing information architecture — the same five bottom tabs, the same filter row, the same distances/notes/albums concepts — and changes hierarchy and styling:

- Feed and saved grids are 3-up square tiles, edge to edge, with a single translucent label plate per tile instead of scattered overlays.
- Saved tiles carry **name and note together** (note is the second line, with a pencil glyph).
- Both profile screens use the **same structure**; only the floating action differs (Edit profile on yours, ⋯ + ★ on theirs).
- Profile spec fields are a flexible inline list, so a profile with 2 fields and one with 6 both look right. Unset fields render as a dashed "+ Field" prompt **on your own profile only**; on other people's profiles they are simply omitted.
- Colour is used as signal only: one blue accent, one green "online" dot, one red destructive.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. They are authored in a proprietary streaming-component format (`.dc.html` + `support.js`); do not port that runtime. **Recreate the screens in the target codebase's own environment** (React Native, SwiftUI, Kotlin/Compose, Flutter, web) using its established components, navigation and theming. If no environment exists yet, pick the most appropriate framework for the product and implement there.

Open `Nearby App Redesign.dc.html` in a browser to see all thirteen screens side by side on one canvas.

## Fidelity

**High fidelity.** Colours, type, spacing, radii and copy are final and specified below. Recreate pixel-accurately using the codebase's existing primitives. Photography is placeholder (drag-and-drop slots) — supply real images.

Frame size for every screen: **390 × 844** (iPhone logical points). Status bar 44pt, tab bar 78pt (incl. 26pt home-indicator inset), leaving a 722pt scroll area; screens with a composer instead of a tab bar have a ~76pt composer and a 724pt scroll area.

---

## Design tokens

### Colour — dark (default)

| Token         | Hex                    | Use                                  |
| ------------- | ---------------------- | ------------------------------------ |
| `bg`          | `#0C0E11`              | screen background                    |
| `surface`     | `#14171C`              | cards, list groups                   |
| `surface2`    | `#1D2229`              | chips, inputs, thumbnails            |
| `line`        | `#272D35`              | 1px separators, dashed borders       |
| `ink`         | `#EEF2F7`              | primary text                         |
| `ink2`        | `#97A1AE`              | secondary text                       |
| `ink3`        | `#68727F`              | tertiary text, inactive icons        |
| `accent`      | `#3D8BFF`              | active state, primary action, unread |
| `accent-ink`  | `#FFFFFF`              | text/icon on accent                  |
| `accent-soft` | `rgba(61,139,255,.16)` | accent-tinted chip fill              |
| `online`      | `#4ED17F`              | online dot                           |
| destructive   | `#F0596B`              | Sign out                             |

### Colour — light

| Token         | Hex                   |
| ------------- | --------------------- |
| `bg`          | `#FAFBFD`             |
| `surface`     | `#FFFFFF`             |
| `surface2`    | `#EFF2F6`             |
| `line`        | `#DFE4EB`             |
| `ink`         | `#111519`             |
| `ink2`        | `#5D6672`             |
| `ink3`        | `#8B95A1`             |
| `accent`      | `#0B62E0`             |
| `accent-ink`  | `#FFFFFF`             |
| `accent-soft` | `rgba(11,98,224,.12)` |
| `online`      | `#1E9E52`             |
| destructive   | `#D93F52`             |

Photo-tile overlays use fixed dark plates in both themes: `rgba(8,10,13,.66)` on feed tiles, `rgba(8,10,13,.72)` on saved tiles and circular photo buttons, each with `backdrop-filter: blur(8px)`. Text on those plates is always `#EEF2F7`, with secondary note text `#C2CBD6` and the note glyph `#7FB2FF`.

### Typography

Two families:

- **General Sans** (Fontshare) — 600 weight, used only for screen titles and profile names. `letter-spacing: -0.03em`.
- **Public Sans** (Google Fonts) — 400/500/600, everything else.

| Role                                                       | Font         | Size / line-height | Weight                      | Tracking          |
| ---------------------------------------------------------- | ------------ | ------------------ | --------------------------- | ----------------- |
| Screen title (`Nearby`, `Inbox`, `Settings`), profile name | General Sans | 27 / 1             | 600                         | -0.03em           |
| Section label (`ACCOUNT`, `PINNED`, `ABOUT`)               | Public Sans  | 9.5 / 1            | 600                         | 0.16em, uppercase |
| List row title                                             | Public Sans  | 14.5 / 1           | 600 (500 for settings rows) | —                 |
| Body / about text                                          | Public Sans  | 14 / 1.5           | 400                         | —                 |
| Chip / filter label                                        | Public Sans  | 12.5–13 / 1        | 500 (600 when active)       | —                 |
| Message preview, meta                                      | Public Sans  | 12.5 / 1           | 400                         | —                 |
| Timestamp, caption                                         | Public Sans  | 10.5–11.5 / 1      | 400                         | —                 |
| Tile name plate                                            | Public Sans  | 11–11.5 / 1.1      | 600                         | —                 |
| Tile note line                                             | Public Sans  | 10 / 1.1           | 400                         | —                 |
| Tab bar label                                              | Public Sans  | 10 / 1             | 500                         | 0.02em            |
| Date divider in chat                                       | Public Sans  | 10 / 1             | 500                         | 0.14em, uppercase |

### Spacing, radius, elevation

- Horizontal screen padding: **18pt** (lists, headers), **20pt** (profile body).
- Grid gutter between photo tiles: **3pt**. Grids are edge-to-edge (no side padding).
- Vertical rhythm: 22pt above a section label, 10–11pt below it; 15pt between list rows with a 1px separator between them.
- Radii: phone frame 42, cards/groups 12, chips & inputs 8–10, tile label plates 7, circular buttons 50%, bubbles 14 (with a 4pt tail corner).
- Card shadow (canvas presentation only): `0 26px 64px rgba(0,0,0,.3)` dark, `0 26px 64px rgba(0,0,0,.14)` light. Floating Edit button: `0 6px 18px rgba(0,0,0,.32)`.
- Minimum hit target 44×44 for all interactive elements; the tab bar items and 40pt circular photo buttons should be padded to meet this.

### Iconography

All icons are 1.6pt-stroke line icons on a 16–21 viewbox, `currentColor`, round caps/joins. No filled/duotone icons except: the star when active (filled white on accent), the online dot, and the send glyph. Do not use coloured icon tiles.

---

## Screens

### 01 Browse (tab 1)

**Purpose:** scan people nearby.

- **Filter row** — horizontally scrolling, 10pt top / 14pt bottom padding, 16pt left inset, 7pt gap, clipped on the right edge to signal scroll. Three 34×34 icon buttons (`surface2`, radius 10): location pin, sliders, star. Then text chips (`surface2`, radius 10, 9×13 padding): `Age`, `Position`, `Online`, and `Right now` in the **active** state (accent fill, accent-ink text, 600).
- **Grid** — `repeat(3, minmax(0,1fr))`, 3pt gap, square tiles (`aspect-ratio: 1`), 5 rows visible (15 tiles), continues on scroll. Important: floor the tracks with `minmax(0,1fr)` — content-sized children otherwise blow the grid out.
- **Tile overlays** — optional and independent:
  - distance, top-right, 10.5/500, `#EEF2F7`, `text-shadow: 0 1px 3px rgba(0,0,0,.6)`, no plate;
  - label band, **full tile width**, flush to the bottom edge (`left/right/bottom: 0`), `background: linear-gradient(transparent, rgba(8,10,13,.9))`, padding `24px 9px 8px` — the tall top padding is the gradient ramp. Holds an optional 5pt green online dot and the display name (11.5/600, single line, ellipsis). No blur, no radius, no inset pill — the gradient is what makes the text legible over any photo.
- Tiles with neither overlay are normal — most profiles have no tagline.

**Copy in the mock:** Will · quem chupa · Jacuzzi ce soir · Pote/fun · Shelter · MASC, with distances 1.2 / 2.8 / 8.2 / 9.4 / 12.2 / 12.6 / 13.6 / 13.7 / 14.5 / 15.8 km.

### 02 Your profile (tab 5)

Vertical photo scroll, not a horizontal carousel.

- **Photo stack** — full-bleed, `flex-column`, 3pt gap: main photo **350pt** tall, then an 18pt sliver of the next photo (the affordance that says "scroll for more"). A 3×18pt vertical rail sits top-right (14pt from top, 12pt right), 4pt gaps, first segment `#EEF2F7`, rest `rgba(238,242,247,.35)`, one per photo.
- **Edit profile button** — pill (radius 22, accent fill, 12×18 padding, icon 15pt pencil + label 13/600), anchored `right: 16` and `bottom: -21` on the photo stack so it **straddles the photo edge**, `z-index: 3`, drop shadow. The body below therefore starts with 34pt top padding.
- **Body** (20pt side padding):
  1. Name `Someone, 35` — General Sans 27/600.
  2. Meta row, 10pt below, 14pt gap: green dot + `Online now`; location arrow glyph + `Lisboa`.
  3. Spec line, 12pt below — inline wrapping list, 8pt gap: values in 13/500 `ink`, separated by `·` in `ink3`. In the mock: `Versatile · 174 cm · He / him`. Then the **empty-field prompt**: a dashed-border chip (radius 8, `line`, accent text/plus glyph) reading `+ Weight`. This chip appears **only on your own profile**; render one per unset field.
  4. Tag chips, 14pt below: `surface2`, radius 8, 6×11, 12.5/500 — `Man`, `Discreet`, `Single`, `Chat`, `Dates`, `Friends`, `Relationship`.
  5. About card, 16pt below: `surface`, radius 12, 14×15 padding, body text 14/1.5, `text-wrap: pretty`.
  6. Album row, 10pt below: dashed `line` border, radius 12, lock icon, title `Private album` (13.5/500) + sub `6 photos · 3 people have access` (12/400 `ink3`), and a `Manage` chip (accent-soft fill, accent text, 600/12.5).
- Tab bar present, `You` active.

### 03 Someone else's profile

Identical structure to 02 — same order, same type, same spacing — so the two read as one component with a mode flag. Differences only:

- Photo **380pt** (no next-photo sliver); 3-segment rail.
- Close (✕) button top-left: 34pt circle, `rgba(8,10,13,.55)` + blur(8).
- Actions bottom-right straddling the photo edge (`bottom: -21`, `z-index: 3`, 9pt gap): a 40pt ⋯ circle on the translucent plate, and a **40pt ★ circle in accent** — this is the favourite/Interest toggle (filled star when saved, outline on the plate when not).
- Meta row shows `Online 1 hour ago` (grey dot) and `9 km away`.
- Spec line shows only the fields this person filled: `Versatile · 177 cm`. No weight, no body type, **no dashed prompt** — absent fields are simply not rendered.
- Album row: `Album locked`, `4 photos`, action chip `Request`.
- No tab bar; a composer instead: text field `Say something…` (`surface2`, radius 10, 11×14), a flame button (`surface2`, radius 9, 36pt) and a send button (accent, radius 9, 36pt).

### 04 Interest (tab 3)

Saved profiles with private notes.

- Title `Interest` (General Sans 27/600). No sub-tabs here — saved profiles are reached by activating the **star filter**, not by a tab.
- Same filter row as Browse, but the **star button is active** (accent fill).
- Search field below it: `surface2`, radius 10, 10×13, magnifier + `Search notes` placeholder, 16pt side margins, 12pt bottom.
- Same 3-up square grid, 3pt gap, 15 tiles.
- Every tile carries a **22pt accent circle with a white filled star** at top-left (7pt inset) — the saved marker.
- Optional distance top-right, same treatment as Browse.
- Label band, same full-width gradient treatment as the feed but with padding `26px 9px 8px` to fit two lines. Holds **up to two lines**:
  - line 1: display name, 11/1.1, 600, `#EEF2F7`, ellipsis;
  - line 2 (4pt below): 9pt pencil glyph in `#7FB2FF` + note text 10/1.1, 400, `#C2CBD6`, ellipsis.
    A tile may have name only, name + note, or neither. Notes in the mock: `Brasileiro / Miraflores, photos first`, `MASC / Met at Trumps`, `XL ACT masc / Weekday evenings only`, `Miguel, 34 / Guimarães, festival`.

### 05 Inbox (tab 4)

- Title `Inbox` (General Sans 27/600), then two text tabs, 22pt gap, on a 1px bottom rule: `Messages` (active — `ink`, 600, 2pt accent underline) and `Albums` (`ink3`, 500). Both with 11pt bottom padding.
- `PINNED` section label with a small pin glyph, then the pinned conversation as a **card** (`surface`, radius 12, 12×13) to lift it out of the list. 20pt gap after.
- Conversation rows: 46pt circular avatar, 13pt gap, name 14.5/600, preview 12.5/400 `ink2` 8pt below, timestamp right-aligned 11.5/400 `ink3`. 15pt padding-bottom, 1px `line` separator, 15pt to the next row.
- **Unread** row: timestamp turns accent, preview text turns `ink` 600, and a 7pt accent dot sits after it.
- An online contact shows a 6pt green dot before the name.
- Tab bar, `Inbox` active.

### 06 Chat

- Header (8pt top, 14pt bottom, 18pt sides, 1px bottom rule): back chevron, 36pt avatar, name 14.5/600 + `Distance unknown` 11.5/400 `ink3`, album icon, ⋯ icon.
- Message list: 18pt padding, 10pt gap.
- Date divider: centred, 10/500, 0.14em, uppercase, `ink3`.
- Incoming bubble: `surface2`, `ink`, radius `14 14 14 4`, 11×14, 14.5/1.45, max-width 74%, timestamp 10.5 `ink3` 7pt below, left aligned.
- Outgoing bubble: accent fill, `accent-ink`, radius `14 14 4 14`, same metrics, right aligned.
- Location message: 250×132 card, radius 14, static map with an accent pin, and a place-name plate bottom-left (`rgba(10,13,17,.72)`, radius 6, 5×9, 11/500). Replace with a real map tile / MapKit snapshot.
- Photo message: 186×232, radius 14, followed by `Sent 12:05`.
- Composer: 12pt top / 26pt bottom / 18pt sides, 1px top rule — 36pt attach button (`surface2`, radius 9), text field, 36pt send button (accent, radius 9).

### 07 Settings (reached from the You tab)

- Title `Settings`, 16pt below it a profile card: `surface`, radius 12, 12×14, 48pt avatar, `Someone` 15/600, `View and edit your profile` 12.5/400 `ink2`, chevron.
- `ACCOUNT` group — one `surface` card, radius 12, rows of 13×14 with a 17pt line icon, label 14.5/500 and chevron; 1px separators inset 43pt from the left (aligned to the label). Rows: **Edit profile**, **Privacy and discretion**, **Notifications**.
- `ABOUT` group — same construction, external-link glyph instead of a chevron. Rows: **Website**, **Source code**, **Discussion**.
- **Sign out** — its own `surface` card 14pt below, destructive icon + label in `#F0596B` (light: `#D93F52`).
- Version string centred, 11/400 `ink3`: `Nearby 0.1.0`.
- Tab bar, `You` active. Theme selection is a **system-level setting**, not an in-app control — there is deliberately no appearance switch here.

### 08 Settings, light theme

The same screen with the light token set, included so both themes are specified. Every screen supports both; only tokens change, no layout differences.

### 09 Album viewer

Full-screen viewer for a private album someone shared. Always dark (`#0A0C0F`) regardless of theme — it is a media surface.

- Status bar in white ink on the dark background.
- **Photo-count segments** centred below it: 34×3pt bars, 6pt gap, 6pt top / 10pt bottom padding. Current photo `#EEF2F7`, others `rgba(238,242,247,.3)`. One per album photo; tap or swipe advances.
- **Sender row** (18pt sides, 14pt bottom): 38pt circular avatar, title `Album` 15/600 `#EEF2F7`, sub `100 m away` 12.5/400 `#97A1AE`, then three 20pt line icons at 16pt gaps — zoom, save to device, close.
- **Photo** fills the remaining height, edge to edge, on `#14171C`. Pinch to zoom; vertical swipe dismisses.
- **Reply composer** (14pt top / 26pt bottom / 18pt sides, 10pt gap): pill text field (radius 22, `#1D2229`, 13×18) with placeholder `Reply to this…`, then two 44pt circular `#1D2229` buttons — flame reaction and open-chat. The flame is a line glyph, not an emoji.
- No tab bar. Presented modally over the chat or profile that linked to it; replying sends into that conversation.

### 10 Inbox · Albums

The second tab of the Inbox. Albums people have shared with you, plus your own.

- Same title and tab row as screen 05, with `Albums` active.
- Grid: `repeat(3, minmax(0,1fr))`, **8pt gap**, 18pt side padding, tiles `aspect-ratio: .78`, radius 12. (Wider gutters and rounded corners than the people grids — these are objects, not faces.)
- First slot is **My albums**: a dashed `line` tile, radius 12, centred 22pt lock glyph over a 12/500 `ink2` label. Not a filled card, so it reads as an entry point rather than an album.
- Album tiles: cover photo, an optional name in a full-width bottom gradient (`linear-gradient(transparent, rgba(8,10,13,.82))`, padding `20px 9px 8px`, 11.5/600), and a **26pt lock badge** top-right (`rgba(8,10,13,.62)` + blur(8)) when you haven't been granted access. Names are optional — many albums are unnamed.
- Tab bar, `Inbox` active.

### 11 Edit album

Reached from My albums. No tab bar (it is a pushed detail screen).

- Header: back arrow + `Edit album`, General Sans 20/600.
- **Header block** — 104×130 cover thumb (radius 12) beside: `ALBUM NAME` section label, the name in General Sans 22/600 with an inline accent pencil, the privacy note `Only you see the album name` (12/1.4 `ink3`), and `5 items · updated Jul 24` (12.5 `ink2`).
- **Photos** — section label with `Drag to reorder` right-aligned (11/400 `ink3`). Grid `repeat(3, minmax(0,1fr))`, 8pt gap, tiles `aspect-ratio: .82`, radius 10. Each tile has a 26pt delete badge top-right (`rgba(8,10,13,.66)` + blur(8), trash glyph); the first also carries a `Cover` pill bottom-left (radius 6, 3×7, 10/600). Last cell is a dashed **Add** tile with an accent plus.
  - Reordering is **drag-and-drop**, not per-tile arrow buttons: arrows obscure the photo and need one tap per position.
- **Shared with (n)** — section label with a destructive `Unshare all` (12/600, `#F0596B`) right-aligned. Rows: 42pt avatar, name (14/600; unnamed profiles render `Someone` in _italic_ `ink2`), and a neutral outlined `Unshare` chip (1px `line`, radius 8, 8×14, 12.5/500). 13pt padding + 1px separator between rows.

### 12 Blocked users

Reached from Privacy and discretion.

- Header: back arrow + `Blocked users` (General Sans 20/600), then one line of explanatory copy (12.5/1.45 `ink3`): what blocking does.
- Count label `8 BLOCKED` in the standard section-label style.
- Rows identical in construction to the Shared-with rows: 42pt avatar (or a `surface2` circle with an `ink3` person glyph when there is no photo), name, outlined `Unblock` chip. Unnamed profiles are italic `ink2`.
- The chip is deliberately **neutral, not destructive** — unblocking is not a dangerous action.
- Tab bar, `You` active.

### 13 Interest · Views

The Views tab of Interest: people who looked at your profile.

- Title `Interest`, then the sub-tab row: `Views` (active) and `Taps`.
- Grid: `repeat(3, minmax(0,1fr))`, 3pt gap, square tiles — same geometry as the feed.
- Per tile: optional distance top-right; a **38pt centred lock circle** (`rgba(8,10,13,.55)` + blur(6)) when the viewer's photo is private; the accent star badge top-left when you've saved them; and a full-width bottom gradient holding the elapsed time (`1 hr`, `3 hrs`) on the left and, when more than one view, an eye glyph + count on the right (both 11/500, `#C2CBD6`).
- Profiles with no photo at all render a 52pt `ink3` person glyph on `surface2`.
- Tab bar, `Interest` active.

### Tab bar (all tabbed screens)

78pt tall: 10pt top padding, 26pt bottom inset, 18pt sides, five equal flex items, each an icon over a 10/500 label with a 5pt gap, 1px `line` top border, `bg` background. Items: **Browse** (2×2 rounded squares), **Right Now** (bolt), **Interest** (star), **Inbox** (speech rectangle), **You** (person). Active item is `accent`; inactive `ink3`. No filled/active background pill.

### Status bar

44pt: time 15/600 at 26pt from the left, and signal / wifi / battery glyphs at the right, all in `ink`.

---

## Interactions & behaviour

- **Tabs** — instant switch, each tab keeps its own scroll position.
- **Feed tile tap** → opens screen 03 as a full-screen modal presented from the bottom; ✕ dismisses.
- **★ on a profile** → toggles saved; filled accent star = saved. Saving surfaces the profile in Interest and reveals the note field.
- **Note editing** — long-press or tap the note line on an Interest tile to edit inline; notes are private and never sent.
- **Search notes** filters saved profiles by both display name and note text.
- **Photo scroll** — profile photos are a vertical scroll, not a horizontal swipe; the right-hand rail highlights the current photo and is not itself interactive.
- **Album request** → `Request` sends an access request and the chip becomes a disabled `Requested`.
- **Empty fields** — never render a label with a blank value. Your own profile shows a dashed `+ Field` prompt per unset field (deep-links into Edit profile); other people's profiles omit them entirely. The spec line and chip row must both tolerate 0…n items, wrapping to multiple lines.
- **Filters** — chips are toggles; an active chip takes the accent fill. The row scrolls horizontally and is clipped, not wrapped.
- **Theme** — follow the OS setting; the light token set is a straight swap with no layout change.
- Transitions: 180ms ease for state/toggle changes; standard platform push/modal transitions for navigation. Nothing in this design needs custom motion.

## State

- `activeTab`, per-tab scroll offset
- `filters` — { rightNow, online, ageRange, position, distance, savedOnly }
- `feed` — paged list of profiles: id, name?, age?, distance?, isOnline, isTravelling, photos[]
- `profile` — the full record; every attribute optional (position, height, weight, bodyType, pronouns, tags[], about, album)
- `saved` — set of profile ids, each with an optional private `note` string
- `noteQuery` — search string for Interest
- `conversations` — id, participant, lastMessage, timestamp, unread, pinned, kind (text | album | location)
- `thread` — messages: direction, kind (text | photo | location), body, sentAt
- `albumAccess` — per-profile: locked | requested | granted
- `albumViewer` — { profileId, photos[], index } when the viewer is open
- `myAlbums` — albums you own: id, name (private to you), photos[] (ordered, first is cover), sharedWith[]
- `receivedAlbums` — albums shared with you: id, sender, coverPhoto, name?, unlocked
- `blocked` — list of blocked profiles
- `interestTab` — views | taps; `views` / `taps` — profile, timestamp, viewCount
- `theme` — from the OS

## Assets

No production imagery is included. Every photo in the prototypes is an empty drop-slot (`image-slot.js`, a prototype-only helper — do not port it). Icons are inline SVG paths defined in the HTML; either lift the paths or map them to the codebase's existing icon set. Fonts: **General Sans** (Fontshare, weights 500/600/700) and **Public Sans** (Google Fonts, 400/500/600) — both free; bundle them rather than loading over the network on mobile.

## Files

| File                          | Contents                                        |
| ----------------------------- | ----------------------------------------------- |
| `Nearby App Redesign.dc.html` | all thirteen screens, laid out on one canvas    |
| `TabBar.dc.html`              | the five-item bottom tab bar, `active` prop     |
| `StatusBar.dc.html`           | the iOS status bar, `time` prop                 |
| `image-slot.js`, `support.js` | prototype runtime — reference only, do not port |

Open the first file in a browser to view the designs. The Dark / Light buttons at the top of the canvas retheme every frame.
