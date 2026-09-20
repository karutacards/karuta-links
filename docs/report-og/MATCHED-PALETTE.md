# Reference-matched palette exports

These are a new version with the dog's palette brought closer to the original Karuta icon: muted coral and peach fur, pale pink-lilac face and paws, and softer burgundy outlines. Yellow hit markers, the plain hammer, and the moderator outfit remain.

All final exports are 256 by 256 pixels with transparency:

- [Lossless WebP](report-matched-256.webp)
- [PNG](report-matched-256.png)

The PNG and lossless WebP were verified pixel-identical. No project files were edited.

## Sampled reference palette

| Area | Sample |
| --- | --- |
| Forehead fur | #CA6A66 |
| Ear fur | #CF8772 |
| Outer outline | #8D3151 |
| Face cream | #F0E3F0 |
| Inner ear | #E6D1E6 |
| Eye burgundy | #611939 |

Samples are median colors from small patches in the original reference, used as generation guides rather than a claim of exact pixel matching.

## Final prompt

Built-in image-generation tool; followed by size/format exports and VTracer 0.6.11 tracing in an ephemeral Docker container.

Use case: precise-object-edit
Input image 1: EDIT TARGET, the existing moderator dog holding a plain hammer, with yellow motion marks and a yellow impact burst.
Input image 2: COLOR REFERENCE ONLY, the original Karuta dog server icon. Match the DOG'S palette to this second reference; do not borrow its pose or facial expression.
Primary request: correct only the dog's fur, face, paws, nose/eye colors and dog outlines so they closely match the original reference. The current target's fur is much too vivid orange and its outlines too saturated red. The original has a muted dusty coral/salmon coat, pinkish mauve shadows, pale cool lavender-cream areas and soft wine-burgundy darks.
Measured color anchors sampled from the original reference:
- Midtone forehead fur: muted dusty coral #CA6A66.
- Lighter ear/coat fur: muted warm peach #CF8772.
- Dog outer outline: softened wine-raspberry #8D3151.
- Cream face and paws: cool pale pink-lilac #F0E3F0, not stark white.
- Inner ears: pale dusty lilac #E6D1E6.
- Eye/nose darks: plum-burgundy #611939, with slightly rosy shading.
Use these as actual palette anchors and match the overall softened, desaturated balance visible in image 2. Fur should read rosy coral with muted peach highlights, NOT bright carrot-orange, pumpkin-orange, yellow-orange or neon salmon. Add the reference's gentle pale lilac-pink cheek shading, retaining the existing facial markings.
Preserve image 1's exact silhouette, pose, squinting expression, mouth, paws, eye and brow shapes, layout, hammer position and details. Do not change the character design or introduce a tongue.
Keep the police cap/uniform, gold buttons and badges, plain burgundy hammer and gold hammer bands unchanged. Keep BOTH triangular motion marks and the entire jagged impact burst YELLOW exactly as they are. This is a dog-palette correction, not a global color filter.
Keep clean smooth outlines and restrained soft shading. No additional detail, texture, grain or outer fringe.
Output a square PNG master with genuine transparent alpha, fully opaque painted interiors and clean antialiased boundaries, ready for final 256 by 256 PNG/WebP and SVG exports. No background, checkerboard, text, logos, watermark or prohibition symbol.

