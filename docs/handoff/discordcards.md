# Handoff: discordcards

No required change in this pass.

The bot already refreshes art from Karuta's own cache and CDN. Shared R2 (`karuta-images`, `karuta-data`) is for Cloudflare siblings: karuta.cards, karuta.today and krta.cc.

Optional later: point renderer URLs at keyed objects on krta.cc `/images/…` or a future `img.krta.cc`. Do not do that until someone opens a bot pass.

*Written by Cursor*
