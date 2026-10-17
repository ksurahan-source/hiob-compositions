# Native typography and graphic renderer handoff — 2026-10-17

Scope: canonical compositions repository only. No deployment, paid submission,
project/MCP mutation or node_modules edits. Changes are pending independent review.

## Source behavior

- `TimelineCompositionV2.tsx` prints v2 gradient fill independently of the authored
  stroke/shadow, and explicitly paints semantic palette spans. The original layout,
  source strings and clip clocks are unchanged. v1 branch/evaluator are unchanged.
- `nativeStyle.mjs` / `.d.mts`, export `@hiob/compositions/native-style`: strict
  `native-style-v1` schema shared with authoring. `reaction/comic/narrative` identify
  authored arrangements; the renderer never guesses layers from a style label.
- Twelve asset-free vector presets have actual SVG consumers in
  `NativeStyleLayer.tsx`: stamp, comic-frame, halftone, ink, rule, paper, tape,
  scanline, glitch-bars, sparkle, grid, arrow. No raw SVG/URL/markup input.
- Independent text binds an existing title/caption ID, exact source substring and
  original display window; it reuses fully measured organic-v2 geometry. Existing
  primary text remains visible and occupies protected space. New phrases are not
  generated. `block-reveal` reveals a geometric background, never individual words.
- Safe area/protected content/primary text collisions are checked. Hollow frames
  use static border supports and never scale/slide their border across the interior.
  Shapes are clipped inside their verified rect. Global rounded presentation frames
  must fit owner and source windows, including very short cues.
- Styles render in a separate shared-composition pass. Original video/image
  transforms, keyframes, crops, source clock and audio remain untouched.

`src/lib/organicText.mjs` remains SHA256
`8441402cbff5424a6c7d8cc0ea03464be068322d00ed133aeb5fe897142282fb`.

## Verification commands

```sh
npm run typecheck
npm run test:ugc
npm run test:motion
node verification/organic-paint/render.mjs
node verification/native-style/render.mjs
```

37 original+new tests initially passed; the final additional rounded-frame test
raises `test:ugc` to 38. Thirteen implicit-motion tests pass. Additional verification
entries also typecheck with `--resolveJsonModule`.

The actual loaded-font canonical PNG regression reproduced the bug: “등장” had
0 bright glyph pixels with gradient vs 7,033 solid-control pixels. After the fix:
6,864. The other nonemphasized lines have 6,306 vs6,640 and 7,380 vs7,656. All three
titles are tested at active/inactive times, and actual semantic-palette pixels must
also remain present. Outputs: `verification/organic-paint/after/report.json` and PNGs.

`verification/native-style/output/manifest.json` records actual source hashes,
per-preset colored-pixel counts, 16 PNG samples and four normal-speed H264 samples.
The four MP4s have 84 frames, 1080x1920, 30fps, 2.8s. They are deliberately muted
renderer diagnostics using a synthetic background and an exact approved title
fixture, **not creative Maru A/B/C candidates, listening evidence or customer finals**.

## Integration boundary / remaining work

The platform worker owns MCP/Studio/SQL input, measured text-layer authoring,
canonical caption-clock projection, ownership/undo and validation parity. Root owns
code review, dependency pins, cloud release and actual Maru three-way production.
The compiler must not generate sequential per-word layers from the source phrase.
An exact-substring binding alone is not proof that the authored treatment respects
the existing no-karaoke policy; source/prepared-line-only authoring is a possible
stricter contract if root chooses that boundary before release.

This adds renderer primitives and three demonstrable layer arrangements. It does
not claim all 12 editing grammars or all seven aesthetic axes are complete style
packages. More fonts, tracking/segmentation/occlusion, real 3D, source-time remap,
overlap transitions, claim/data graph and music-driven styling remain distinct work.
P0 text pixels are source-verified; actual customer-path MP4 and direct listening
must still be verified after the platform and audio delivery fixes are integrated.
