const AVATAR_HASH = /^(?:a_)?[a-f0-9]{32}$/i
const SNOWFLAKE = /^\d{17,20}$/

export function parseDiscordAvatar(value: unknown): string {
  return typeof value === 'string' && AVATAR_HASH.test(value) ? value : ''
}

export function discordAvatarUrl(userId: string, avatar = '', size = 64): string {
  const id = String(userId || '').trim()
  const hash = parseDiscordAvatar(avatar)
  if (hash && SNOWFLAKE.test(id)) {
    const ext = hash.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`
  }
  let index = 0
  if (SNOWFLAKE.test(id)) {
    index = Number((BigInt(id) >> 22n) % 6n)
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
