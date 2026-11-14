# Royal-VPN — Build Workload

Source design: `Downloads/Mobile app design request-handoff VPN/mobile-app-design-request/project/Royal-VPN Mobile.dc.html`
Stack: Expo (React Native + TypeScript)

## 1. Foundation — DONE
- [x] Design tokens ported into `src/theme.ts` (orange `#FF9300`, blue `#000F9A`, Poppins, dark surfaces)
- [x] Nav + icons installed: `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@expo/vector-icons`
- [x] Global state in `src/store/useVpnStore.ts` (Zustand), mirrors the prototype's `Component.state`

## 2. Navigation shell — DONE
- [x] `src/navigation/RootNavigator.tsx` + `src/navigation/TabBar.tsx` — blurred 5-tab bar (`expo-blur`), active `#FF9300` / inactive `rgba(255,255,255,0.45)`

## 3. Screens — DONE (`src/screens/*.tsx`)
- [x] **Home** — connect button w/ 1.4s connecting transition, live timer, stats grid, quick-toggle chips
- [x] **Servers** — search bar (static), 9-server list, selected/BEST/load-color states, favorite star
- [x] **Security** — DNS status card, 3 toggle rows, Trusted Networks row
- [x] **Devices** — device list, THIS DEVICE badge, sign-out
- [x] **Settings** — profile row, gradient plan card, settings list, log out, version footer

## 4. Shared components — DONE
- [x] `ToggleSwitch`, `ServerRow`, `SettingsRow` in `src/components/`

## 5. Polish — IN PROGRESS
- [x] `tsc --noEmit` passes clean
- [x] Verified bundle compiles via `expo start --web` (Metro bundled 669 modules, no errors)
- [ ] Visual comparison against the `.dc.html` prototype screen-by-screen (needs iOS Simulator/Expo Go/device — not available on this Windows machine; web preview used as a stand-in)
- [ ] Double-check exact pixel values (radii, spacing, font sizes) against `_ds/.../tokens/*.css`

## How to run
```
cd Royal-VPN
npx expo start        # then press i/a for iOS/Android, or w for web
```
Note: port 8081 was in use by another process on this machine during dev — Expo will prompt for an alternate port, or pass `--port <n>`.

## Open questions (confirm before finishing settings/auth screens)
- Real VPN connection logic (native module / backend) is out of scope for this prototype pass — is a UI-only build correct for now?
- Auth/login screen isn't in the prototype — assume already-authenticated user (Ada Okafor) for v1?
