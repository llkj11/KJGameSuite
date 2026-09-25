# Neural Clash: Turbo Tensor Edition

A Super Nintendo-style 1-on-1 fighting game in which nine 2026 AI models fight, plus a hidden boss. Every special move, win quote and costume comes from a documented meme or quirk of that model.

Design document: https://claude.ai/code/artifact/9e44ecf0-0da7-4284-991d-42f0cadb548f

## Play

Open `games/neural_clash/index.html` in a browser, or run `node server.js` from the repository root and open http://localhost:3000/games/neural_clash/. No build step is needed.

| Action | Player 1 | Player 2 | Gamepad |
| --- | --- | --- | --- |
| Move / jump / crouch | W A S D | Arrow keys | D-pad or left stick |
| Light / heavy punch | U / I | `,` / `.` (or Numpad 4 / 5) | Y / X |
| Light / heavy kick | J / K | `;` / `'` (or Numpad 1 / 2) | B / A |
| Easy special (direction + button) | O | `/` (or Numpad 6) | L / R |
| Start / pause | Enter | Numpad Enter | Start |

- **Specials:** QCF+P, DP+P, QCB+K and QCF+K.
- **Easy specials:** hold a direction and press the easy-special button. Neutral, forward, back and down give the four specials.
- **Super:** QCF QCF+P, or easy special + heavy punch, with a full COMPUTE meter (3 bars).
- **EX special:** press two punch or two kick buttons with the motion. It costs one bar.
- **Throw:** forward or back + heavy punch, up close.
- **Mythos 5.1:** clear arcade mode, or press up, up, down, down on the `?` slot of the select screen.

## Modes

Arcade (8 fights, then the Mythos boss) · Versus 2P · Versus CPU · Training (dummy, infinite meter) · Options (difficulty, rounds, timer, voice, volume, CRT scanlines, 8:7 aspect).

## Generated audio: Lyria and ElevenLabs

The game ships with a built-in SNES-style synth:

- It runs at 32 kHz with 8 voices and an echo bus, like the S-DSP.
- It has hand-written themes for every fighter.
- It covers every sound effect.
- Voice lines use the browser's speech synthesis.

Any file listed in `assets/manifest.json` replaces its synth version automatically. The scripts in `tools/` fill that manifest:

```bash
cd games/neural_clash

# Music: Google Lyria 3.5 via the Gemini API (13 tracks: title, select, every fighter, boss, victory)
GEMINI_API_KEY=... node tools/generate_music.mjs

# Sound effects: ElevenLabs Sound Effects API (32 effects)
ELEVENLABS_API_KEY=... node tools/generate_sfx.mjs

# Voice lines + announcer: ElevenLabs text-to-speech (one voice per fighter)
ELEVENLABS_API_KEY=... node tools/generate_voices.mjs
```

**Flags:**

- `--only id1,id2` regenerates only those items.
- `--force` overwrites existing files.
- `--dry-run` prints the prompts without calling any API.
- `--model lyria-3-clip-preview` makes cheap 30-second drafts (music only).
- `--list-voices` shows the voice IDs available to your key (voices only).

Prompts and voice choices are in `tools/prompts.json`.

**Music post-processing:** raw Lyria files go to `assets/music/raw/`, which is gitignored. When `ffmpeg` is on the PATH, or `pip install imageio-ffmpeg` has been run, each track is then processed:

- Silence is trimmed from both ends, so the track loops cleanly.
- Loudness is matched to the synth.
- The victory jingle is cut to 7 seconds.
- The result is encoded as a 128 kbps MP3 in `assets/music/`.

`--process-only` re-runs this step without calling the API. In the game, music files are streamed rather than decoded whole. Returning to a theme on the select screen resumes it where it left off.

**Setup notes:**

- The scripts need Node 18 or newer.
- Behind an HTTPS proxy on Node 22, add `NODE_USE_ENV_PROXY=1`.
- Serve the game over HTTP (not `file://`) so the browser can load the generated files.

## Code map

| File | Purpose |
| --- | --- |
| `js/core.js` | Namespace, constants, math, SNES 15-bit color ramps, settings |
| `js/font.js` | 8x8 bitmap font baked from Press Start 2P (OFL) |
| `js/input.js` | Keyboard + Gamepad API, per-frame snapshots |
| `js/audio.js` | SNES-style synth, echo, sequencer, SFX, voice/announcer, asset loader |
| `js/music.js` | Composer + tracker data for all 13 songs |
| `js/sprites.js` | 14-joint rig rasterized to 15-color palettes, outlines, portraits |
| `js/characters.js` | Roster, costumes, specials, supers, quotes, normals frame data |
| `js/stages.js` | 10 stages: parallax, HDMA skies, line-scroll and Mode 7 floors |
| `js/fighter.js` | Fighter state machine, motion inputs, special and super types |
| `js/fight.js` | Rounds, hit resolution, projectiles, minions, camera, HUD |
| `js/ai.js` | CPU opponent (difficulty 1-5, per-character personality) |
| `js/scenes.js` | Title, options, select, VS, win, continue, ending |
| `js/main.js` | Loop, scaling, mosaic transitions, CRT filter |

For development, URL hashes skip the menus:

- `#fight=fable,grok[,stage[,demo]]`: `demo` makes both fighters CPU.
- `#select`
- `#title`
- `#options`

## Credits

- **Font:** Press Start 2P by CodeMan38, SIL Open Font License 1.1.
- **Everything else:** sprites, stages, music and code are original and generated in code.
