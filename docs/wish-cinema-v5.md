# Shared painted wish cinema v5

Approved storyboard composition, completed at 10 fps, 1280×720, six seconds.

- 3★: compact blue effect, 340×340 compositing region.
- 4★: medium violet effect, 620×620 compositing region.
- 5★: approved golden full-screen rupture, unchanged.

Blue and violet use generated drawn intermediate cels, with original approved keyframes at whole seconds 0–4. Background and portal center (640,274) remain fixed. Short exposure blends connect the drawings. Their final second is a stationary background and rarity glow; gold has a clean final hold from 5.3 seconds. No item or silhouette is baked into any movie.

The common player overlays actual catalog artwork for artifacts, weapons, outfits and accessories. It uses the same movie for single and multiple wishes, supports skipping, Escape, reduced motion and media failure fallback. Reward and purchase logic is unchanged.

Media: public/assets/wish-anime-{3,4,5}star-v5.mp4 and wish-anime-background-v5.png. The shared renderer is public/pages/wish-cinema.js; server media routes support byte-range seeking.

Source storyboards, generation atlases and reproducible renderers are retained in the local production output. Publication is a separate action requiring approval.
