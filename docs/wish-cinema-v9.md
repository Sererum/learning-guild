# Painted wish cinema v9

Approved shared animation for all courses and equipment categories. Each movie is 1280 × 720, 20 fps, 120 frames and six seconds long.

- **5 stars:** the approved expansive gold vortex and burst, retaining the original gold movie.
- **4 stars:** violet spiral rotates at 1.5 radians per second before decelerating into the burst. Its painted effects extend slightly outside the fixed outer ring.
- **3 stars:** blue vortex grows almost to the fixed outer ring, using the same painted frames and timing as the approved blue sequence.

The background and ring stay fixed in the blue and violet sequences. Their final second is a clean stationary background with glow. Equipment is rendered separately by the shared player, so weapons, outfits, artifacts and accessories use the same movie for their rarity. No silhouette or item outline is baked into the movie.

## Runtime assets

- `public/assets/wish-anime-3star-v9.mp4`
- `public/assets/wish-anime-4star-v9.mp4`
- `public/assets/wish-anime-5star-v9.mp4`
- Existing poster: `public/assets/wish-anime-background-v5.png`.

The shared player selects these files by rarity. The server supports byte-range seeking. Skip, reduced-motion behavior, item reveal, purchases and reward calculations retain their existing behavior.

## Validation

Run `node --test tests/wish-cinema-shared.test.mjs` for shared equipment markup and HTTP range handling with temporary profile state. Production validation confirmed the dimensions, frame rate and duration of all three movies; the gold file matches the approved original exactly. Local motion checks found no unchanged frames in the violet vortex interval and less than one pixel of blue core displacement.
