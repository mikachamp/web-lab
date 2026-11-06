# web-lab

**My web and 3D experiments, with the techniques written down so I (and you) can reuse them.**

Three.js scenes, scroll-driven camera work, and the boring-but-important parts: phone layouts, reduced motion, performance fallbacks, and builds that open by double-clicking a file. Each demo is a hand-built page, and the lessons live in notes, not just in my head.

## Demos

| Demo | What it shows | Folder |
|---|---|---|
| Animation methodologies lab | Five approaches side by side (pure 3D, spring/FLIP UI, CSS craft stack, editorial, hybrid) | `animation-methodologies-lab/` |
| Gyro Winder Live | A product page rendered live from code: five scroll cues, ordered explode, blueprint toggle, hold-to-power with synthesised audio. v2 adds SDF melt-and-trace organic parts, a heat-tint steel ring and a sapphire-style glass crystal. Vite + TypeScript | `gyro-winder-live/` |
| Design studies | Four luxury-style layouts I rebuilt to learn from (see below) | `design-studies/` |

Sites I built for local businesses (work in progress) are in [concept-sites](https://github.com/mikachamp/concept-sites).

The animation lab and the design studies load Three.js r128 from a CDN, so they need an internet connection. Gyro Winder Live is the one built to run fully offline (below).

## Design studies

I rebuild great layouts to learn them. `design-studies/` holds four of these: an architecture atelier (aetheria), a watchmaker (nocturnal), a private-wealth firm (sonder) and a perfumer (vespera), plus an index page.

To be clear about what they are: **these four are study builds from Alex Carter's BoostStash tutorial. The designs are not mine.** I built them to see how the layouts, typography, grain and 3D objects fit together.

The point is the loop:
1. **Study.** Rebuild the layout and measure how it works.
2. **Document.** Each study is broken down into patterns and tokens in my design library: [mika-os-knowledge-base](https://github.com/mikachamp/mika-os-knowledge-base). My AI agents use those notes to grow the library.
3. **Apply.** The patterns end up in my own work, like [concept-sites](https://github.com/mikachamp/concept-sites).

They load Three.js r128 from a CDN, so they need internet.

## Techniques

### Build so it opens from `file://`
Gyro Winder Live is a Vite 5 + TypeScript project with `three@0.169.0` from npm. With `base: './'` and `vite-plugin-singlefile`, `npm run build` produces **one self-contained `dist/index.html`** (about 553 kB). Send the file to someone and it works: no server, no CDN. Checked from `file://` with the network blocked, 0 errors.

### Live 3D that is not a video
Every part is generated from code, in real millimetres, in a small studio scene lit by a baked environment. The scroll drives a list of camera cues, framed by *size* ("fit 52 mm on screen") so a phone and a monitor get the same shot. One clock drives every moving part. Post chain: MSAA HDR, bloom, ACES tone mapping, grain.

### SDF melt-and-trace (Gyro Winder Live v2)
The leather cradle and the two posts are no longer plain primitives. `src/sdf.ts` (pure maths, no three.js) combines circles, rounded boxes, capsules and ellipses with a smooth union, rasterises the field to a 0.4 mm grid, traces the outline with marching squares (saddle cells handled), simplifies it with Douglas-Peucker plus one Chaikin pass, and `src/melt.ts` extrudes it into a `THREE.Shape` with a small bevel. Each part is built once behind the loader (about 7-12 ms each, 100-186 points). Rings, base and pod stay as clean engineered shapes.

### Heat-tint ring and sapphire crystal
- The steel outer gimbal uses `MeshPhysicalMaterial` iridescence (IOR 2.0, film thickness 90-260 nm) driven by a 512 px thickness map generated in code: heat gathers at the two pin sockets and a small weld, plus both rims and noise. It reads straw, teal-blue and purple.
- The watch crystal is a domed lathe lens with transmission 1, IOR 1.77, thickness 6 and dispersion 0.2. The dial indexes bend and shift through it.
- Cost on my RTX 4060 laptop GPU, uncapped, headless: roughly 10-25% more frame time than v1 (hero about 1170-1200 fps for v1 vs 895-910 for v2 at 1440x900). Both hold the 165 Hz display cap with vsync. I have not tested a real phone yet.

### Phone layouts and reduced motion
- Gyro Winder Live honours `prefers-reduced-motion` and gives a *still frame*, not a half-broken animation. I check it by taking two screenshots 1.5 s apart and comparing them.
- The animation lab has a phone breakpoint (860 px) and a manual reduced-motion toggle. Reading the media query itself is on my list.
- Both were tested at 1440x900 and 390x844 with no sideways scroll.

### Performance fallbacks (Gyro Winder Live)
- An on-screen fps meter behind `?fps` (average over 2 s, slowest frame over 5 s, size, pixel ratio, quality step).
- Adaptive quality ladder (below 40 fps, one step every 2 s): lower pixel ratio (steps 1-2), bloom off (3), iridescence off (4), crystal drops transmission for a cheap see-through glass (5). Pixel ratio is capped at 1.75. `?quality=low` starts at step 4; `?quality=0..5` forces a step. `?noadapt` switches that off so I can measure honestly.
- The loop stops when the tab is hidden.
- **No-WebGL fallback:** canvas hidden, a note shown, text still scrolls.
- Audio is created only inside a user gesture, so browsers do not block it.

### Logo-build intros
A badge or symbol builds into the full logo, then hands over to the page. Rules: once per session, skippable by click or key, skipped for reduced motion, and driven from one timeline `t` so I can freeze it with `?introT=` for screenshots. I used this in my [concept sites](https://github.com/mikachamp/concept-sites).

### Testing with headless Chrome
`puppeteer-core` with a cached Chrome, at **1440x900** and **390x844**:
- 0 console errors, 0 failed requests
- `scrollWidth - innerWidth == 0`
- opens from `file://`
- reduced motion is a still frame
- WebGL timing on the **real GPU** (`--use-angle=d3d11`), because software rendering reports meaningless frame rates

## What broke, and how I fixed it

- **Headless picked the wrong GPU.** My first fps numbers came from the integrated chip. Adding `--force_high_performance_gpu` made Chrome use the discrete GPU, confirmed from the WebGL renderer string.
- **`overflow-x: hidden` broke sticky.** It turns the wrapper into a scroll box and kills `position: sticky`. `overflow-x: clip` fixed it.
- **Round parts rendered inside out.** `LatheGeometry` wants its profile bottom to top, and hand-built ribbons need `DoubleSide`.
- **Overflow "fixed" by hiding it.** A tab strip looked fine at 390 px because the overflow was hidden, not removed. Review caught it.
- **Screenshots lie.** Software-rendered WebGL manages about 1 fps. For timing I now use the GPU plus freeze hooks like `?introT=`.
- **Labels on the wrong side.** A part that projects to exactly the screen centre has a left/right coin flip in the two-column labels. Known and documented rather than hidden.

## Run it

The animation lab and the design studies: open the HTML file in a browser. Gyro Winder Live:

```bash
cd gyro-winder-live
npm install
npm run dev          # local dev server
npm run build        # type-check, then one inlined dist/index.html
npm run preview      # serve the build on port 4173
```

```bash
npm test             # 9 unit tests for the SDF code (node --test)
```

Add `?fps` to the URL for the meter. Other test hooks: `?freeze` with `__live.step(t)`, `?cue=hero|close|apart|around|back`, `?t=`, `?noadapt`, `?quality=low`.

Build story: [docs/BUILD-STORY.md](docs/BUILD-STORY.md).
