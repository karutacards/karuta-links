import {
  buildContestSnapshot,
  eventIsRewarded,
  nextPollAction,
  parentEventCounter,
  copySnapshotImages,
  type ContestSource
} from './contest'
import { insertContestDump, lastDumpedEvent, listRecentContests } from './db'
import { contestImagePath } from './images'
import { getFirestoreDocument, listFirestoreDocuments } from './firestore'
import { CARD_HUNT_NAME } from './types'

export type PollEnv = Env & {
  FIRESTORE_PROJECT_ID?: string
  FIRESTORE_SERVICE_ACCOUNT?: string
}

export function firestoreSource(env: PollEnv): ContestSource | null {
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

export async function pollCardHunt(
  env: PollEnv,
  source: ContestSource | null = firestoreSource(env)
): Promise<'skipped' | 'waiting' | 'created' | 'exists'> {
  if (!source) return 'skipped'

  const last = await lastDumpedEvent(env.DB)
  const eventCounter = parentEventCounter(await source.getParent())
  const event = eventCounter === null ? null : await source.getEvent(eventCounter)
  const action = nextPollAction(last, eventCounter, eventIsRewarded(event))
  if (action !== 'dump' || eventCounter === null || !event) {
    if (env.IMAGES && last >= 1) {
      const latest = (await listRecentContests(env.DB, 1))[0]?.snapshot
      if (latest && latest.entries.length > 0) {
        const probe = await env.IMAGES.head(contestImagePath(latest.eventCounter, 1))
        if (!probe) {
          await copySnapshotImages(env.IMAGES, latest)
        }
      }
    }
    return action === 'waiting' ? 'waiting' : 'skipped'
  }

  const entries = await source.listEntries(eventCounter)
  const snapshot = buildContestSnapshot(eventCounter, event, entries)
  if (env.IMAGES) {
    await copySnapshotImages(env.IMAGES, snapshot)
  }
  const created = await insertContestDump(env.DB, snapshot)
  return created ? 'created' : 'exists'
}
