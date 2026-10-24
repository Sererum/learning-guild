# Teyvat map attribution

Map artwork and geography: © HoYoverse. All rights reserved.

Source: [HoYoLAB Teyvat Interactive Map](https://act.hoyolab.com/ys/app/interactive-map/index.html?lang=ru-ru#/map/2), retrieved 2026-10-22.

This is a local snapshot of the official public map tiles. The source map revision and public endpoints are recorded in `source.json`. No generated or speculative geography has been added. Only blank padding was removed, and the image was encoded as WebP. The artwork does not inherit the application source-code license.

The overview uses source zoom -3. The detail layer, retrieved 2026-10-24 from the same official revision at zoom -1, provides four native pixels per overview pixel along each axis. It is locally bundled as `detail-4x-*.webp`, with an integrity manifest in `detail-4x/`; its 99 tiles load only around the visible viewport. No AI upscaling, sharpening or changes to geographic coordinates are applied. Offline viewing remains supported.

All eight regions, including Nod-Krai and Snezhnaya, appear in the official region list and the retrieved map. The application’s fixed learning route uses 96 public surface teleport coordinates from the official marker endpoint. Its sequence and educational meaning are application overlays.
