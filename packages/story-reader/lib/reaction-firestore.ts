import { collection, doc, getAggregateFromServer, getDocFromServer, serverTimestamp, setDoc, sum } from 'firebase/firestore'
import { ensureAnonymousUser, getClients, storedPageId, validatePageId } from './firebase-client'
import { emptyCounts, reactionOptions, type Counts, type Reaction } from './reaction-store'

export async function fetchReactions(pageId: string): Promise<{ counts: Counts; selected: Reaction | null }> {
  validatePageId(pageId)
  const { db, auth } = getClients()
  await auth.authStateReady()
  const reactions = collection(db, 'pages', storedPageId(pageId), 'reactions')
  const [totals, own] = await Promise.all([
    getAggregateFromServer(reactions, { heart: sum('heart'), like: sum('like'), moved: sum('moved'), wow: sum('wow'), remember: sum('remember') }),
    auth.currentUser?.isAnonymous ? getDocFromServer(doc(reactions, auth.currentUser.uid)) : Promise.resolve(null),
  ])
  // Preserve the deployed aggregate/index shape without exposing the retired option.
  const data = totals.data()
  return { counts: { heart: data.heart, like: data.like, moved: data.moved, wow: data.wow },
    selected: reactionOptions.find(option => own?.data()?.[option.key] === 1)?.key || null }
}

export async function saveReaction(pageId: string, selected: Reaction | null) {
  validatePageId(pageId)
  const { db } = getClients()
  const user = await ensureAnonymousUser()
  const values = { ...emptyCounts(), remember: 0 }
  if (selected) values[selected] = 1
  await setDoc(doc(db, 'pages', storedPageId(pageId), 'reactions', user.uid), { ...values, updatedAt: serverTimestamp() })
}
