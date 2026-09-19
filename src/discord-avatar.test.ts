import { describe, expect, it } from 'vitest'
import { discordAvatarUrl, parseDiscordAvatar } from './discord-avatar'

describe('discord avatar', () => {
  it('keeps a custom hash and builds a CDN url', () => {
    expect(parseDiscordAvatar('a'.repeat(32))).toBe('a'.repeat(32))
    expect(parseDiscordAvatar(`a_${'b'.repeat(32)}`)).toBe(`a_${'b'.repeat(32)}`)
    expect(parseDiscordAvatar('nope')).toBe('')
    expect(discordAvatarUrl('135694375647838208', 'a'.repeat(32))).toBe(
      `https://cdn.discordapp.com/avatars/135694375647838208/${'a'.repeat(32)}.png?size=64`
    )
    expect(discordAvatarUrl('135694375647838208', `a_${'b'.repeat(32)}`)).toBe(
      `https://cdn.discordapp.com/avatars/135694375647838208/a_${'b'.repeat(32)}.gif?size=64`
    )
  })

  it('falls back to the default embed avatar from the snowflake', () => {
    expect(discordAvatarUrl('135694375647838208')).toBe(
      'https://cdn.discordapp.com/embed/avatars/0.png'
    )
    expect(discordAvatarUrl('1')).toBe('https://cdn.discordapp.com/embed/avatars/0.png')
  })
})
