# Arena SHOOTER 1.1

A browser-based 3D first-person shooter (Counter-Strike style) built with **Three.js**.
Runs on Windows, Android, iOS — anything with a modern browser. No install needed.

## ▶️ Run

```bash
node server.js
# open http://localhost:8080
```

Or any static server: `python3 -m http.server 8080`.

## 🎮 Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | `W A S D` | Left joystick |
| Look | Mouse | Drag right side of screen |
| Shoot | Left click | 🔥 button |
| Reload | `R` | R button |
| Sprint | `Shift` | — |
| Jump | `Space` | ⤒ button |
| Crouch | `Ctrl` | — |
| Release mouse | `Esc` | — |

## 🗺️ Add your custom map

Drop your model into:

```
assets/models/free_fire_new_peak_3d_model.glb
```

The game automatically looks for that filename first. If it isn't there, it
falls back to `assets/models/map.glb`, then `map.gltf`. If no model is found,
a grey-box test arena is loaded so development can continue.

You do **not** need to rename the file. The original filename
`free_fire_new_peak_3d_model.glb` is supported directly.

Supported: `.glb` / `.gltf` (with textures embedded or alongside).

## 🤖 Bots

- Defaults to **3 bots** as requested.
- Bots patrol, chase on sight, line-of-sight check against the actual map, and shoot back.
- Headshots do **4× damage** (one-shot kill).
- When all bots are down, they respawn for continuous play.

## 📁 Project structure

```
index.html          — entry, HUD, menu
server.js           — zero-dependency static server
src/
  main.js           — game loop, state, bot/player wiring
  world.js          — map loader, triangle collision, raycasting
  player.js         — FPS controller (gravity, jump, crouch, collision)
  weapon.js         — hitscan rifle, tracers, muzzle flash, recoil
  bot.js            — enemy AI (patrol/chase, line-of-sight)
  input.js          — keyboard/mouse/touch input
  audio.js          — procedural SFX (no asset files needed)
  style.css         — HUD, menu, crosshair, mobile controls
assets/models/      — put map.glb here
```

## 🚧 Roadmap

- [ ] Replace placeholder gun with a user-supplied `.glb` weapon model
- [ ] Replace placeholder bots with the supplied character model + animations
- [ ] Multiple weapons (pistol / AK / sniper) with pickups
- [ ] Round system, score, win/lose screens
- [ ] Real sound effects (footsteps, reload, hit markers)
- [ ] Mobile UI polish (sprint, fire while aiming)
- [ ] Online multiplayer (later)

## ✅ Current state

- [x] First-person controller with collision, jump, crouch, sprint, view bob
- [x] Procedural rifle with muzzle flash, tracers, sparks, recoil, reload
- [x] 3 AI bots with chase / patrol / line-of-sight shooting
- [x] Hitscan bullets with head/body hit boxes
- [x] HUD: health, ammo, bot counter, FPS, hit markers, kill feed
- [x] Damage vignette + procedural audio
- [x] On-screen touch controls for Android / iOS
- [x] Loads any `.glb` map placed in `assets/models/map.glb`
- [x] Falls back to a grey-box test arena if no map is present
