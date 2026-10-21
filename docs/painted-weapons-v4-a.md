# Painted weapons v4 — swords

Two original sword illustrations generated separately through the built-in `image_gen.imagegen` tool in default built-in mode, both with `transparent_background: true`. One generation call per requested asset. The final PNGs are unchanged copies of generated outputs. Existing quill assets, application JavaScript and profile data were not changed.

## Manifest and holding anchors

Coordinates are approximate visual anchors measured relative to the full square canvas, with origin at top left. Both swords point upper right. Consumers should anchor the leather grip rather than the guard.

| Asset | Dimensions | Bytes | Alpha | Grip centre | Guard | Pommel | Blade tip |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public/assets/item-wanderer-sword-v1.png` | 1254 × 1254 | 395472 | yes | (30%, 80%) | (38%, 70%) | (22%, 93%) | (81%, 4.5%) |
| `public/assets/item-moonblade-v1.png` | 1254 × 1254 | 639658 | yes | (28.5%, 80%) | (38%, 69%) | (19%, 91%) | (96%, 2.5%) |

## Visual verification

Both saved project PNGs were inspected with `view_image`; dimensions and alpha were checked from file metadata. They depict single complete swords with distinct solid metal blades, guards, leather grips and pommels. There are no hands, bodies, UI, text, borders, scenery or cropped object edges. Both are far below 8 MB.

The generator did not preserve the requested 6–8% transparent margin or exact requested anchor coordinates: the wanderer sword reaches about 4.5% from the top edge, while Moonblade reaches about 2.5% from the top and 4% from the right. Use contained layout and the actual grip anchors above when rendering; do not assume the requested prompt coordinates became exact image coordinates.

## Exact prompts

### wanderer-sword

Tool: `image_gen.imagegen`.

Mode: built-in default generation. `transparent_background: true`.

Generated output ID: `exec-15350e82-c79c-45fe-99e2-f13f380e2ab6.png`.

Saved project path: `public/assets/item-wanderer-sword-v1.png`.

```text
Use case: stylized-concept. Asset type: a single transparent inventory and held-equipment image for an anime fantasy RPG. Draw ONE genuine elegant FULL-LENGTH ONE-HANDED STRAIGHT SWORD for a wandering scholar-adventurer, restrained starter 3-star rarity. A clearly recognizable long solid sharpened steel double-edged blade with subtle sage-green engraved fuller, neat tapered sharp point, muted sage inlay near the blade base, graceful bronze crossguard with modest curved ends, one tiny sage gem, dark brown wrapped leather handgrip, modest rounded bronze pommel. This is a proper practical sword with a long steel blade, not a quill, not a feather, not a pen, not a writing tool. Full sword shown unambiguously from pommel to tip. Fine high-quality 2D anime fantasy game equipment painting, beautifully rendered brushed metal, restrained delicate engraving, convincing reflected light and material depth, crisp clean silhouette, elegant craftsmanship; simpler ornamentation than legendary equipment. Composition is essential: square transparent canvas. Entire sword diagonally leaning upper-right, pommel center approximately (25% canvas width,92% canvas height), leather grip center approximately (34%,75%), steel blade tip approximately (74%,8%). Keep at least 6% empty transparent safety margin around every extreme, no cropping. The lower-left pommel and grip form a clear handle suitable for a character hand; blade extends from guard toward upper-right. Only ONE connected sword, nothing else. Genuinely transparent alpha background with no paper, backing, floor, scenery or cast shadow. No hands, body, human, lettering, numbers, UI, border, watermark, detached sparkles or glowing background.
```

### moonblade

Tool: `image_gen.imagegen`.

Mode: built-in default generation. `transparent_background: true`.

Generated output ID: `exec-99a30ece-2006-4696-b8c5-639010404dac.png`.

Saved project path: `public/assets/item-moonblade-v1.png`.

```text
Use case: stylized-concept. Asset type: one premium transparent inventory and held-equipment image for an anime fantasy RPG. Draw ONE legendary MOONBLADE SWORD, 5-star rarity, full-length gorgeous one-handed sword with a LONG SOLID DOUBLE-EDGED SILVER AND ICE-BLUE METAL BLADE, not feathers, not a pen, not a writing tool. Blade is a continuous sharpened steel form from guard to acute point, polished silver edges around a deep icy-blue crystalline fuller, subtle engraved lunar constellations integrated on metal. Magnificent elegant crescent-moon silver crossguard with two crescent ends and a central faceted sapphire, refined silver filigree, a few small blue crystal accents physically mounted to guard, clear slender dark navy leather-wrapped grip, silver blue-gem pommel. Elaborate legendary craftsmanship distinct from a starter sword; beautiful true metal depth, luminous contained cool rim light, convincing silver reflections and crystalline highlights, finely painted high-quality 2D anime fantasy game equipment illustration. Crisp strong readable sword silhouette, controlled ornamentation, not an abstract energy wand. One single connected sword only. Square canvas, sword on diagonal: pommel around (25%,92%), grip center around (34%,75%), blade tip around (74%,8%). Leave visible transparent safety margin at least6–8% on each edge, ensure the whole sword fits fully inside canvas with NO cropping. Grip in the lower-left portion, blade rises to upper-right; proper handle for a character hand. Genuinely transparent alpha background, no paper/backing/floor/scenery/shadow. No hands, human, body, text, numbers, UI, border, watermark, detached floating moons, particles, background glow or diffuse magical cloud.
```


