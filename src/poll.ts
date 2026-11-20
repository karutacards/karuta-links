import {
  buildContestSnapshot,
  eventIsRewarded,
  nextPollAction,
  parentEventCounter,
  copySnapshotImages,
  type ContestSource
} from './contest'
import { insertContestDump, lastDumpedEvent, listRecentContests } from './db'
import { getFirestoreDocument, listFirestoreDocuments } from './firestore'
import { CARD_HUNT_NAME } from './types'

export function firestoreSource(env: Env): ContestSource | null {
  const projectId = env.FIRESTORE_PROJECT_ID
  const serviceAccount = env.FIRESTORE_SERVICE_ACCOUNT
  if (!projectId || !serviceAccount) return null
  return {
    getParent: () => getFirestoreDocument(projectId, serviceAccount, `contests/${CARD_HUNT_NAME}`),
    getEvent: (eventCounter) => getFirestoreDocument(
      projectId,
      serviceAccount,
      `contests/${CARD_HUNT_NAME}/events/${eventCounter}`
    ),
    listEntries: (eventCounter) => listFirestoreDocuments(
      projectId,
      serviceAccount,
      `contests/${CARD_HUNT_NAME}/events/${eventCounter}/contest_entries`
    )
  }
}

// Missing framed-card copies on the newest contest are retried every ten minutes for a
// day after it was written. After that a copy that still fails is assumed to be gone at
// the source.
export const IMAGE_REPAIR_WINDOW_MS = 24 * 60 * 60 * 1000
export const IMAGE_REPAIR_INTERVAL_MS = 10 * 60 * 1000

export async function pollCardHunt(
  env: Env,
  source: ContestSource | null = firestoreSource(env),
  now = Date.now()
): Promise<'skipped' | 'waiting' | 'created' | 'exists'> {
  if (!source) return 'skipped'

  const last = await lastDumpedEvent(env.DB)
  const eventCounter = parentEventCounter(await source.getParent())
  const event = eventCounter === null ? null : await source.getEvent(eventCounter)
  const action = nextPollAction(last, eventCounter, eventIsRewarded(event))
  if (action !== 'dump' || eventCounter === null || !event) {
    await repairLatestContestImages(env, now)
    return action === 'waiting' ? 'waiting' : 'skipped'
  }

  // Read everything before writing, so a Firestore failure leaves nothing behind
  // and the next poll tries the same event again.
  const entries = await source.listEntries(eventCounter)
  const snapshot = buildContestSnapshot(eventCounter, event, entries)
  const created = await insertContestDump(env.DB, snapshot)
  if (!created) {
    return 'exists'
  }
  await copySnapshotImages(env.IMAGES, snapshot)
  return 'created'
}

async function repairLatestContestImages(env: Env, now: number): Promise<void> {
  // The cron runs once a minute, so this fires on one poll in each ten-minute slot.
  if (now % IMAGE_REPAIR_INTERVAL_MS >= 60_000) {
    return
  }
  const latest = (await listRecentContests(env.DB, 1))[0]
  if (!latest || now - latest.createdAt > IMAGE_REPAIR_WINDOW_MS) {
    return
  }
  await copySnapshotImages(env.IMAGES, latest.snapshot)
}
