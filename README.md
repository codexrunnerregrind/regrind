# Open Grind — my fork

This is my personal fork of [Open Grind](https://git.opengrind.org/open-grind/open-grind), an unofficial, free and ad-free Grindr client.

I made it mostly because I wanted the app on my iPhone. Upstream targets Android and desktop, so I added an iOS build and then kept going, filling in the things I missed while actually using it day to day.

|                                                        |                                                    |                                            |
| :----------------------------------------------------: | :------------------------------------------------: | :----------------------------------------: |
| ![Browse grid](./contrib/screenshots/browse-grid.webp) | ![Right Now](./contrib/screenshots/right-now.webp) | ![Inbox](./contrib/screenshots/inbox.webp) |

**A few honest warnings:** this is a personal project. I build it for myself and sideload it onto my own phone. I'm not publishing releases, I'm not offering support, and I'll rebase or force-push over this branch whenever it suits me. If you want something stable, use [upstream](https://git.opengrind.org/open-grind/open-grind) — it's the real project, and all the credit for it belongs there.

> All screenshots here are from demo mode (`PUBLIC_ENABLE_DEMO=1`), so everything you see is mock data.

## What's here that isn't upstream

Some of this is my own work, some of it is other people's pull requests that haven't landed upstream yet and that I merged in early because I wanted them.

### iOS

- An actual iOS build — Tauri iOS target, a unique bundle identifier so it sideloads cleanly, and signing set up for a personal developer team
- WKWebView recovers instead of going white when the web content process is killed
- Native touches: swipe-back gesture, haptics on reactions, "Save Image" on downloaded chat media, and the keyboard accessory bar and its safe-area gap removed

### Albums

Upstream can display an album someone sends you. This fork lets you actually manage them:

- Create, rename, delete albums and reorder their contents
- A My Albums grid and a separate "shared with me" feed
- An albums section on profiles
- Share and unshare albums straight from the chat composer, including expiring shares
- Expiry markers on album messages, and replies and reactions on album content

|                                                          |                                                      |                                                                     |
| :------------------------------------------------------: | :--------------------------------------------------: | :-----------------------------------------------------------------: |
| ![Albums inbox](./contrib/screenshots/albums-inbox.webp) | ![Edit album](./contrib/screenshots/album-edit.webp) | ![Share with expiry](./contrib/screenshots/album-share-expiry.webp) |
|                   Shared-with-me feed                    |                Edit, reorder, unshare                |                        Share with an expiry                         |

### Chat

- Video messages
- Replies, with swipe-to-reply
- Share your location
- Double-tap to react
- A received-photos gallery, media download button, and one consistent story-style chrome across every media viewer
- Confirm before blocking, and an action row in the chat menu

|                                          |                                                          |
| :--------------------------------------: | :------------------------------------------------------: |
| ![Chat](./contrib/screenshots/chat.webp) | ![Media viewer](./contrib/screenshots/media-viewer.webp) |
|   Expiring photo and a shared location   |              The shared media viewer chrome              |

### Favorites and profiles

- Notes on favorite profiles, shown on the Views grid too
- A dedicated Favorites screen, plus a quick-filter toggle on the browse grid
- A blocked users screen in account settings

|                                                                    |
| :----------------------------------------------------------------: |
| ![Favorites with notes](./contrib/screenshots/favorite-notes.webp) |
|                  Favorites, with searchable notes                  |

### Notifications

- Local notifications for messages and taps, which open the relevant screen when tapped

### Interface

- A general UI redesign closer to the official app
- Settings rebuilt as grouped lists, with three themable colors and a proper palette
- Quick filters on the Right Now feed — sort, hosting, age and position

|                                                  |                                                      |
| :----------------------------------------------: | :--------------------------------------------------: |
| ![Settings](./contrib/screenshots/settings.webp) | ![Appearance](./contrib/screenshots/appearance.webp) |
|            Settings as grouped lists             |               Theming, light and dark                |

## Building

Same as upstream: see [BUILDING.md](./BUILDING.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for the toolchain. For iOS you'll also need Xcode and your own signing identity.

## Credit

All the real work is upstream's. Thanks to the Open Grind maintainers and contributors — and specifically to KinkyMonk and Anton Krylov, whose commits are in this branch under their own names.

## License

[MIT](./LICENSE), same as upstream.
