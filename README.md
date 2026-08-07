# Open Grind

A fork of [Open Grind](https://git.opengrind.org/open-grind/open-grind), an unofficial, free and ad-free Grindr client.

It started because I wanted the app on my iPhone. Upstream builds for Android and desktop, so I added an iOS build, then kept going and filled in the things I missed while using it every day.

|                                                        |                                                    |                                            |
| :----------------------------------------------------: | :------------------------------------------------: | :----------------------------------------: |
| ![Browse grid](./contrib/screenshots/browse-grid.webp) | ![Right Now](./contrib/screenshots/right-now.webp) | ![Inbox](./contrib/screenshots/inbox.webp) |

Fair warning: I build this for myself and sideload it onto my own phone. There are no releases, no support, and I rewrite this branch whenever it suits me. If you want something stable, go to [upstream](https://git.opengrind.org/open-grind/open-grind), that's the real project.

> Every screenshot here is from demo mode (`PUBLIC_ENABLE_DEMO=1`), so it's all mock data.

## What's different

Some of this is mine, some comes from pull requests that haven't landed upstream yet.

### iOS

Runs on iPhone, with the native bits you'd expect: swipe back, haptics, saving photos out of a chat, and a keyboard that stays out of the way.

### Albums

Upstream shows you albums other people send. Here you can also build your own, reorder them, share them straight from the chat composer with an expiry, and unshare later.

|                                                          |                                                      |                                                                     |
| :------------------------------------------------------: | :--------------------------------------------------: | :-----------------------------------------------------------------: |
| ![Albums inbox](./contrib/screenshots/albums-inbox.webp) | ![Edit album](./contrib/screenshots/album-edit.webp) | ![Share with expiry](./contrib/screenshots/album-share-expiry.webp) |
|                      Shared with me                      |                   Edit and reorder                   |                        Share with an expiry                         |

### Chat

Video messages, replies with swipe to reply, sharing your location, double tap to react, and a photo viewer that behaves the same everywhere.

|                                          |                                                          |
| :--------------------------------------: | :------------------------------------------------------: |
| ![Chat](./contrib/screenshots/chat.webp) | ![Media viewer](./contrib/screenshots/media-viewer.webp) |
|     An expiring photo and a location     |                     The photo viewer                     |

### Favorites

Notes on the profiles you favorite, searchable, plus a favorites screen of their own and a list of everyone you've blocked.

|                                                                    |
| :----------------------------------------------------------------: |
| ![Favorites with notes](./contrib/screenshots/favorite-notes.webp) |
|                  Favorites, with searchable notes                  |

### Notifications

Notifications for new messages and taps, which open the right screen when you tap them.

### Interface

A redesign closer to the official app, settings as grouped lists, theme colors you can pick, and quick filters on the Right Now feed.

|                                                  |                                                      |
| :----------------------------------------------: | :--------------------------------------------------: |
| ![Settings](./contrib/screenshots/settings.webp) | ![Appearance](./contrib/screenshots/appearance.webp) |
|            Settings as grouped lists             |                 Pick your own colors                 |

## Building

Same as upstream, see [BUILDING.md](./BUILDING.md) and [CONTRIBUTING.md](./CONTRIBUTING.md). For iOS you'll also need Xcode and your own signing identity.

## Credit

All the real work is upstream's. Thanks to everyone who builds and maintains it.

## License

[MIT](./LICENSE), same as upstream.
