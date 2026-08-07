# Open Grind

A fork of [Open Grind](https://git.opengrind.org/open-grind/open-grind), an unofficial, free and ad-free Grindr client.

This fork started because I wanted to try the app on my iPhone. The original builds for Android and desktop, so I got it running on iOS, then kept going and filled in the things I missed while using it every day.

I build this for myself and sideload it onto my own phone. There are no releases.

**NOTE:** Most of the work here was done with AI, which is why I haven't opened any pull requests against the original project.

<img src="./contrib/screenshots/browse-grid.webp" alt="Browse grid" width="220">
<img src="./contrib/screenshots/right-now.webp" alt="Right Now" width="220">
<img src="./contrib/screenshots/inbox.webp" alt="Inbox" width="220">

> Every screenshot here is from demo mode (`PUBLIC_ENABLE_DEMO=1`), so it's all mock data.

## What's different

Some of this is mine, some comes from pull requests that haven't landed in the original project yet.

### Albums

- View albums shared with you
- Create and edit your own albums
- Reorder the photos in an album
- Share or unshare an album from the chat composer
- Share with an expiry, or unshare later

<img src="./contrib/screenshots/albums-inbox.webp" alt="Albums inbox" width="220">
<img src="./contrib/screenshots/album-edit.webp" alt="Edit album" width="220">
<img src="./contrib/screenshots/album-share-expiry.webp" alt="Share with expiry" width="220">

### Chat

- Support for video messages and locations
- Reply to messages, photos, locations
- Share your location or pick a location
- Download media (photos / videos)
- Received photos gallery. All the photos from a conversation in one place, reachable from the chat top bar.

<img src="./contrib/screenshots/chat.webp" alt="Chat" width="220">
<img src="./contrib/screenshots/media-viewer.webp" alt="Media viewer" width="220">

### Favorites

- Favorites screen
- Add notes to the profiles you favorite
- Search through your notes

<img src="./contrib/screenshots/favorite-notes.webp" alt="Favorites with notes" width="220">

### Interface

- General redesign with a minimalist look
- Redesigned settings
- Appearance of the app: pick your own theme, colors, etc
- Manage blocked contacts
- Set your current location, or pick one on the map
- Swipe between tabs
- Haptics feedback
- A small bubble that shows up when someone views your profile
- Tap 7 times on app version to enter / leave Demo mode
- Plenty of other changes I'm probably forgetting :)

<img src="./contrib/screenshots/settings.webp" alt="Settings" width="220">
<img src="./contrib/screenshots/appearance.webp" alt="Appearance" width="220">

## Building

Same as the original project, see [BUILDING.md](./BUILDING.md) and [CONTRIBUTING.md](./CONTRIBUTING.md). For iOS you'll also need Xcode and your own signing identity.

## Credit

All the real work belongs to the [original project](https://git.opengrind.org/open-grind/open-grind). Thanks to everyone who builds and maintains it.

## License

[MIT](./LICENSE), same as the original project.
