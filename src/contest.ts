import { contestImagePath, contestImageUrl, copyContestImage } from './images'
import { CARD_HUNT_NAME, CONTEST_KIND, type ContestEntry, type ContestSnapshot, type ContestWinner } from './types'

export const CONTEST_MAX_SCORE = 1300

export type ContestSource = {
  getParent(): Promise<Record<string, unknown> | null>
  getEvent(eventCounter: number): Promise<Record<string, unknown> | null>
  listEntries(eventCounter: number): Promise<Array<{ id: string; data: Record<string, unknown> }>>
}

export function compareContestEntries(a: ContestEntry, b: ContestEntry): number {
  const score = (entry: ContestEntry) => (Number.isFinite(entry.score) ? entry.score : -1)
  const submittedAt = (entry: ContestEntry) => (
    Number.isFinite(entry.submittedAt) ? entry.submittedAt : Number.POSITIVE_INFINITY
  )
  return score(b) - score(a)
    || submittedAt(a) - submittedAt(b)
    || a.code.localeCompare(b.code)
}

export function formatContestScore(score: number): string {
  if (!Number.isFinite(score) || score < 0) return 'Not scored'
  if (score === 1) return 'Judging failed'
  return ((score / CONTEST_MAX_SCORE) * 100).toFixed(2)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function parseWinner(value: unknown): ContestWinner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const place = asNumber(row.place)
  const score = asNumber(row.score)
  const reward = asNumber(row.reward)
  const userId = asString(row.userId)
  if (place === null || score === null || reward === null || !userId) return null
  return { place, userId, score, reward }
}

export function parseContestEntry(
  cardId: string,
  data: Record<string, unknown>,
  eventCounter: number
): ContestEntry {
  const score = asNumber(data.contestScore) ?? -1
  const sourceUrl = asString(data.contestImageUrl) || null
  return {
    cardId,
    code: asString(data.code) || cardId,
    edition: asString(data.edition),
    number: asString(data.number),
    characterKey: asString(data.metaCharacterId),
    seriesKey: asString(data.metaSeriesId),
    submitter: asString(data.contestSubmitter),
    submittedAt: asNumber(data.contestSubmittedAt) ?? Number.POSITIVE_INFINITY,
    score,
    imageUrl: contestImageUrl(eventCounter, cardId),
    sourceUrl
  }
}

function parseReference(
  event: Record<string, unknown>,
  eventCounter: number
): ContestEntry | null {
  const card = event.referenceCard
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null
  const row = card as Record<string, unknown>
  const sourceUrl = asString(event.referenceImageUrl) || asString(row.contestImageUrl) || null
  return {
    cardId: 'reference',
    code: asString(row.code) || 'CONTEST',
    edition: asString(row.edition),
    number: asString(row.number),
    characterKey: asString(row.metaCharacterId),
    seriesKey: asString(row.metaSeriesId),
    submitter: '',
    submittedAt: 0,
    score: asNumber(event.referenceScore) ?? -1,
    imageUrl: contestImageUrl(eventCounter, 'reference'),
    sourceUrl
  }
}

export function buildContestSnapshot(
  eventCounter: number,
  event: Record<string, unknown>,
  entries: Array<{ id: string; data: Record<string, unknown> }>
): ContestSnapshot {
  const parsed = entries.map((row) => parseContestEntry(row.id, row.data, eventCounter))
  parsed.sort(compareContestEntries)
  const winners = Array.isArray(event.winners)
    ? event.winners.map(parseWinner).filter((row): row is ContestWinner => row !== null)
    : []
  winners.sort((a, b) => a.place - b.place)
  return {
    kind: CONTEST_KIND,
    contestName: CARD_HUNT_NAME,
    eventCounter,
    prompt: asString(event.prompt),
    judgingFinishedAt: asNumber(event.judgingFinishedAt),
    buyInPrice: asNumber(event.buyInPrice),
    currency: asString(event.currency) || null,
    prizePool: asNumber(event.prizePool),
    submissionCount: asNumber(event.submissionCount) ?? parsed.length,
    reference: parseReference(event, eventCounter),
    winners,
    entries: parsed
  }
}

export async function copySnapshotImages(
  bucket: R2Bucket,
  snapshot: ContestSnapshot
): Promise<void> {
  const cards = [
    ...(snapshot.reference ? [snapshot.reference] : []),
    ...snapshot.entries
  ]
  for (const card of cards) {
    if (!card.sourceUrl) continue
    try {
      await copyContestImage(bucket, contestImagePath(snapshot.eventCounter, card.cardId), card.sourceUrl)
    } catch {
      // The page still renders; a later GET cannot recover a missing framed-card URL.
    }
  }
}

export function parentEventCounter(parent: Record<string, unknown> | null): number | null {
  const value = asNumber(parent?.eventCounter)
  return value !== null && value >= 1 ? value : null
}

export function eventIsRewarded(event: Record<string, unknown> | null): boolean {
  return event?.rewarded === true
}

export function nextPollAction(
  lastDumped: number,
  eventCounter: number | null,
  rewarded: boolean
): 'skipped' | 'waiting' | 'dump' {
  if (eventCounter === null || eventCounter <= lastDumped) return 'skipped'
  if (!rewarded) return 'waiting'
  return 'dump'
}
