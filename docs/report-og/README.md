# Report form artwork

Source art and generation prompts for the `/report` Open Graph thumbnail. These files are not bundled into the Worker. Instead, `src/report-og.ts` embeds [`cop-hat-badge-256.webp`](cop-hat-badge-256.webp) as the base64 string `REPORT_OG_BASE64`, and the Worker serves those bytes at `/report-og.webp`. A test in `src/report-og.test.ts` fails when the embedded bytes and this file differ.

To change the thumbnail, replace `cop-hat-badge-256.webp`, then paste the output of this command from the repository root into `REPORT_OG_BASE64`:

```bash
node -e "process.stdout.write(require('node:fs').readFileSync('docs/report-og/cop-hat-badge-256.webp').toString('base64'))"
```

The thumbnail is the gold hat badge with the burgundy head silhouette.

- [Master PNG](cop-hat-badge-master.png) (1,254 by 1,254)
- [256 PNG](cop-hat-badge-256.png)
- [256 WebP](cop-hat-badge-256.webp)
- [Prompt](HAT-BADGE-PROMPT.md)
