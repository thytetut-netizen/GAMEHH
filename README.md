# OPERATION HEBREW

**Two Players. One Mission. Learn Hebrew Together.**

A browser-based, two-player co-op mission built with Phaser 3, Vite, Express, and Socket.IO. All game art is drawn locally with Phaser Graphics and all sound/music is synthesized with the Web Audio API. It needs no account, API key, paid asset, or external game service.

## Requirements

- Node.js 20 or newer
- npm
- A modern desktop browser

## Install and run locally

From this folder:

```bash
npm install
npm run dev
```

Vite runs the browser client at `http://localhost:5173`; the multiplayer server runs at `http://localhost:3001`. Vite proxies Socket.IO traffic to the server. Keep both processes running while playing.

On Windows, after installing dependencies once with `npm install`, you can double-click `open-game.bat` to start the production server and open the game at `http://localhost:3001`.

## Test a two-player room

1. Open `http://localhost:5173` in one browser window and choose **Create Room**.
2. Copy the five-character room code from the lobby.
3. Open the same URL in a private/incognito window or a second browser profile. Join with the code.
4. The host starts the mission once both player slots show online.
5. Test the full mission together: collect the blue key, open the door, press the blue and red switches as different players within 24 seconds, stun the robot with **Space**, use the two generator controls, then meet at the exit.
6. Try a third private window to confirm that the full-room message appears.

For separate computers on a local network, open the Vite URL using the development computer's LAN IP (port 5173). The dev server is configured to listen on all interfaces. Your firewall must allow the Vite and game server ports. For play over the public internet, deploy the production server as described below.

## Controls and learning

- **WASD** or **arrow keys**: move
- **E**: interact
- **Space**: fire the stun tool
- **Shift**: run
- **Esc**: pause

English assistance can be switched off in the menu or audio/access settings. The vocabulary panel keeps reviewed words in this browser's local storage. Pronunciation uses the browser's Speech Synthesis API with a Hebrew voice when one is installed; gameplay does not depend on it.

## Automated checks and production build

```bash
npm test
npm run build
npm start
```

In production mode the server serves the Vite build and hosts Socket.IO on the same origin. `PORT` is read from the environment and defaults to `3001`.

## Deploy for internet multiplayer

Deploy this folder to a Node.js hosting service or server that supports a continuously running Node process and WebSocket connections. A static-only host such as GitHub Pages cannot run the multiplayer server.

Configure the service to:

1. Install with `npm install` (or `npm ci` after generating and committing a lockfile).
2. Build with `npm run build`.
3. Start with `npm start`.
4. Set `NODE_ENV=production`. The host should provide `PORT`; if it does not, the app listens on port `3001`.
5. Route public HTTPS traffic to the Node service and allow WebSocket upgrades on the same origin. No separate frontend URL or CORS setting is needed.

Open the deployed HTTPS URL in two separate browsers or computers, create a room in one, and join it from the other. For a true internet test, use a second network (for example, mobile data) rather than two clients behind the same local network. Keep the server process running for as long as the room should remain available. Rooms and mission state live in server memory and reset when the process restarts.

## Multiplayer and server behavior

- Room codes are five characters and rooms have two reserved seats.
- Shared objectives, key pickup, doors, switch pairing, robot health, generator controls, and extraction are validated by the Socket.IO server.
- Positions are client-predicted for responsive movement, then rate-limited and checked by the server; remote players are rendered from frequent shared state updates.
- A disconnected player keeps their seat for 30 seconds and can resume with the same browser storage. After the grace period, that seat is released.
- No player account is used. The reconnect key is a random browser-local identifier, not a login credential.

## Current scope

This is one complete mission prototype. Enemy behavior is intentionally simple, there is no persistent account or cross-process room store, and reconnecting after the 30-second grace period is not supported. Browser speech depends on installed system voices. The experience is tuned for desktop keyboard/mouse play.
