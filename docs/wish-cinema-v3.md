> Superseded by [wish-cinema-v5.md](wish-cinema-v5.md). This is an archived production note; current media use v5.

# Shared painted wish cinema v3

All courses and all equipment kinds use public/pages/wish-cinema.js. No item silhouette or private artwork is baked into the videos. The actual catalog artwork is inserted as a separate, larger layer.

Public media: public/assets/wish-anime-{3,4,5}star-v3.mp4 and wish-anime-background-v3.png. 1280×720, 10 fps, 6 seconds plus 1.2 seconds of final hold in the player. Last seven frames: fixed background and stationary rarity glow, no flying effects.

All variants share the approved five-star imagegen painted cels and fixed camera registration. Four-star exposure is 0.62 of gold, burst width 1440 vs 1600; three-star exposure is 0.52, width 1280. These are art-direction controls, not measured perceptual ratios. Unlike the earlier sparse wisps, both include the complete vortex, rupture, rays and debris. FX palettes are mapped to violet and blue while leaving the background unchanged.

The module supports skip, Escape, closed-dialog cleanup, reduced motion, media-load failure and ten-pull summary. It does not purchase or grant items; the existing server action remains authoritative.

Original plates were generated using built-in imagegen. This revision recomposes those painted plates in the existing canvas renderer; it makes no new image API requests. Public videos contain no profile data.

## Publication scope

Target repository: Sererum/learning-guild (current branch). Public platform files only:

- public/pages/wish-cinema.js — shared video player and media mapping.
- public/pages/wishes.js — delegates every banner/item to the shared player.
- public/pages/wishes.css — large separate item layer and responsive presentation.
- public/assets/wish-anime-3star-v3.mp4
- public/assets/wish-anime-4star-v3.mp4
- public/assets/wish-anime-5star-v3.mp4
- public/assets/wish-anime-background-v3.png
- server.mjs — allowlisted video serving and byte ranges.
- tests/wish-cinema-shared.test.mjs — shared kinds/rarities and media range coverage.
- tests/wish-animation-browser-check.mjs — checks actual v3 media in the browser.
- docs/wish-cinema-v3.md — production notes and this publication scope.

The upload adds about 13.4 MiB of public media. No personal profiles, progress, answers, configuration or credentials are included. No server-side reward logic changes. Publishing is pending explicit approval.
