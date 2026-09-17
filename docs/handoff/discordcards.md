# Handoff: discordcards

No bot patch for Card Hunt dumps. krta.cc polls Firestore every minute. Recipe: [discordcards-contest-dump.md](discordcards-contest-dump.md).

The bot already refreshes art from Karuta's own cache and CDN. Shared R2 (`karuta-images`, `karuta-data`) is for Cloudflare siblings: karuta.cards, karuta.today and krta.cc.

Optional later: point renderer URLs at keyed objects on krta.cc `/images/…`. There is no `img.krta.cc`.

*Written by Cursor*
