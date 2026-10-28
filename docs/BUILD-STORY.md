# web-lab build story

## The shape of the work

I build web and 3D pages the way I build parts: sketch several options, pick one, then test it hard. The rules I follow are in my Three.js playbook, learned the hard way over several rejected design rounds.

1. **Offer options first.** Two to four concepts side by side on one page, and the owner picks before I touch the real thing.
2. **The reference is the spec.** Render, compare side by side, repeat.
3. **One idea per scene.** Mixing two concepts got rejected.
4. **No clichés.** Spinning torus knots and generic particle swirls were rejected as boring. A scene should be specific to what the thing does.

## Step 1: the methodologies lab

I was never sure whether pure Three.js, spring-driven UI, a CSS craft layer, or editorial typography was the right default, so I built a page with all five side by side and measured them. The conclusion in my notes: none of them wins alone. The best result is a four-layer stack: a texture layer (gradient mesh and grain), a 3D canvas, a spring/transform UI layer, and a typographic HUD on top. The grain is the glue, laid over both canvas and DOM so a procedural model looks grounded.

## Step 2: phone layouts

I wrote a phone breakpoint (860 px) into the lab and re-ran it in headless Chrome at 1440x900 and 390x844: 0 overflow and 0 console errors. I keep the originals backed up before touching them.

A reviewer later noticed the tab strip was cut off at the edge: the overflow was hidden rather than fixed. I count that as a lesson: "no sideways scroll" must mean the content fits, not that the scrollbar is gone.

## Step 3: the live-3D method, tested on a product

I read a 9-step guide to building 3D product sites that render live from code, then tested it on one object: a watch winder with seven parts measured in mm. The steps I applied:

- build the parts from code with a small polished bevel on the edges
- two materials per part (satin faces, polished edges)
- a studio environment baked into the scene
- a scroll cue list framed by size
- an ordered explode where the top parts leave first and return last
- a blueprint toggle that shows the same geometry as edges only
- one clock and synthesised audio for the ticks
- a film-style post chain

The first version was one HTML file with Three.js from a CDN.

## Step 4: port it to Vite, keep it portable

Next I ported it into a Vite 5 + TypeScript project with `three@0.169.0` from npm. I split the single file into modules: scene, explode, cues, labels, audio, post, fps meter, and a main loop. The scene logic is copied unchanged; what is new is the engineering around it:

- one-file build via `vite-plugin-singlefile`, `base: './'`
- an fps meter, adaptive quality, and a `?noadapt` switch for fair measurement
- a hidden-tab pause that guards against double loops
- a still frame under reduced motion (I also stopped the LED glow easing, which "crept")
- a real fallback when WebGL is missing, instead of a blank page
- an inline favicon so the page makes no 404 request

### How it was checked

Headless Chrome 152 through `puppeteer-core`, new build and original side by side at the same scroll positions, at 1440x900 and 390x844 (mobile emulation, DPR 2). Results recorded: all five cues step through, blueprint toggles, the hold-to-power press creates the audio context only on the press, `npm run build` passes in about a second, 0 console errors, 0 sideways scroll.

Headless numbers on my laptop's discrete GPU were about 137 fps in the hero cue and about 134 fps in the apart cue. The integrated chip ran about 67 fps. Headless is not vsynced, so these show *headroom*, not what a phone does. The result note left "real phone fps" explicitly as not met and wrote me the steps to measure it, instead of quietly ticking it.

## Step 5: a design library to feed the next build

I started recording studied sites, tokens and patterns in a library, so each new page starts from measured ideas rather than from memory. I also record my own patterns separately (badge-builds-into-logo, print-in layer reveals, a live ember canvas), so I can reuse what I made. Those patterns show up in my [concept sites](https://github.com/mikachamp/concept-sites).

## What I'd do next

- Bundle the fonts so offline looks identical to online.
- Add a `?cue=` URL so I can screenshot a specific scroll cue.
- Measure on a real phone, and write the numbers down.
- The next effects on my list for the winder: melt-and-trace geometry, an iridescent heat tint, and glass with real refraction.

## Tools

Three.js (r128 via CDN in the lab; 0.169.0 from npm in Gyro Winder Live), Vite 5, TypeScript, `vite-plugin-singlefile`, Web Audio API, `puppeteer-core` with headless Chrome 152, Obsidian for the playbook and design library.
