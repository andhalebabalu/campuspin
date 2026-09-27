# CampusPin mobile app

The Android and iOS app for **students** and **businesses**, built with Expo (React Native) and
TypeScript. It talks to the same NestJS API as the web app and reuses its shared packages
(`@platform/contracts` for schemas and types, `@platform/api-client` for HTTP).

Staff accounts (super admin, admin, moderator) have no mobile app. If they sign in, the app tells
them to use the web admin panel.

## What is in it

| Account | Tabs | Other screens |
|---|---|---|
| Student | Home (feed), Community (college group chats), Market, Explore (places and colleges), Profile | Post and comments, member profiles, listing detail, sell and edit listing, my listings, buyer–seller messages, place detail with map, write a review, send an enquiry, college page, suggest a place, student verification, edit profile, privacy and notifications, notifications, blocked members |
| Business | Dashboard, Enquiries, Reviews, Account | Add a listing (map pin, photos), review QR code, business profile and logo, notifications |

Community and marketplace are for verified students only, the same rule as on the web.

**Ads and announcements** are set by staff in the web admin panel (Admin → Ads & announcements):
a full-screen ad when the app opens (on screen for a set time, with a close button after a set
time) and cards in the "Featured" section of the student home and the business dashboard.

## Run it on your phone (no Android Studio needed)

1. Start the API and the database as usual (see the root README). The API must be on port 3001.
2. Install the packages once, and build the shared packages:

   ```bash
   npm run build:packages        # from the repo root
   cd apps/mobile
   npm install                   # this app has its own node_modules (see "Why not a workspace")
   ```

3. Install **Expo Go** on your phone from the Play Store or App Store.
4. Start the dev server:

   ```bash
   npm start
   ```

5. Scan the QR code in the terminal with Expo Go (Android) or the Camera app (iPhone).

The phone and the computer must be on the **same Wi-Fi**. The app finds the API on the computer
automatically (the dev server's address, port 3001). The first time, Windows Firewall asks whether
Node.js may accept connections: allow it on private networks.

### If the phone cannot reach the computer

- College or office Wi-Fi often blocks phone-to-computer traffic. Use a phone hotspot for both, or
  run `npm run start:tunnel` and point the app at a tunnel for the API too:
  create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL=https://<your-api-tunnel>/api/v1`.
- Profile → About CampusPin shows which API address the app is using (development builds only).

## Checks

```bash
npm run typecheck     # TypeScript, including typed routes
npm run lint          # eslint-config-expo
npm run doctor        # expo-doctor: dependency and config problems
```

After adding a library, install it with `npx expo install <package>` so the version matches the SDK.

## Build an APK to share with testers

Builds run in Expo's cloud (EAS), so no Android Studio is needed.

```bash
npm install -g eas-cli
eas login                     # free Expo account
eas init                      # once: links the project to your Expo account
eas build -p android --profile preview
```

The build gives you a link: open it on any Android phone to install the APK. The API must be
reachable from the internet for testers (set `EXPO_PUBLIC_API_URL` as an EAS environment variable for
the `preview` environment).

## Release to the stores

1. Deploy the API and the website somewhere public (HTTPS).
2. In the Expo dashboard, add environment variables for `production`:
   `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SITE_URL` and `GOOGLE_MAPS_API_KEY` (Android maps; create it
   in Google Cloud with "Maps SDK for Android" enabled).
3. `eas build -p android --profile production` (an `.aab` for Play Store) and/or `-p ios`.
4. `eas submit -p android` / `eas submit -p ios`, or upload the file by hand.
5. The stores ask for a privacy policy URL, screenshots and a short description.

The app id is `com.campuspin.app` (in `app.json`); change it before the first store upload if you
want a different one, because it cannot be changed afterwards.

## How it is put together

```
src/
  app/                  Expo Router: every file is a screen
    (auth)/             welcome, login, register, check email, forgot password
    (student)/          the student tabs
    (business)/         the business tabs
    (shared)/           screens pushed over the tabs (details, forms, settings)
    staff.tsx           "use the web admin panel"
    _layout.tsx         fonts, providers and the role guards (Stack.Protected)
  components/ui/        the design system: text, buttons, fields, cards, sheets, toasts…
  features/             feature pieces: community, marketplace, places, business
  services/             one file per API area (same shape as the web app's services)
  lib/                  API client and token refresh, session, env, formatting, errors
  theme/tokens.ts       colours, type scale, spacing, shadows (mirrors the web tokens)
```

- **Sessions**: the access token is kept in memory, the refresh token in the phone's secure storage
  (Keychain / Keystore). Refreshing is single-flight, like on the web, because the API treats a
  reused refresh token as theft.
- **Data**: TanStack Query for loading, caching and pull-to-refresh. Chats check for new messages
  every 6 seconds while open (the API has no websockets yet).
- **Images**: photos are resized to at most 1600 px and re-encoded as JPEG before upload (the API
  accepts 5 MB at most). In development, upload URLs that say `localhost` are rewritten to the API's
  LAN address so the phone can load them.

### Why not a workspace

Expo pins React to an exact version (19.2.3 for SDK 57), the web app uses a newer one, and one app
must never load two copies of React. So this app keeps its own `node_modules`, links the shared
packages with `file:` dependencies, and `metro.config.js` resolves their imports (such as `zod`)
from this app. Run `npm run build:packages` at the root after changing a shared package.
