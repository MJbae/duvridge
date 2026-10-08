import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { configuration, isFirebaseConfigured } from './firebase-config'

const VALID_ID = /^[A-Za-z0-9_-]{1,120}$/
export const storedPageId = (pageId: string) => `memoir-${pageId}`
let clients: { auth: Auth; db: Firestore } | undefined
let signingIn: ReturnType<typeof signInAnonymously> | undefined

export function getClients() {
  if (typeof window === 'undefined') throw new Error('브라우저에서 반응을 남겨 주세요.')
  if (!isFirebaseConfigured()) throw new Error('반응 기능을 준비 중이에요.')
  if (clients) return clients

  const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  if (useEmulators && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    throw new Error('연결 오류예요. 운영자에게 알려 주세요.')
  }

  // Preserve the app name so existing anonymous reaction sessions remain usable.
  const existingApp = getApps().find((app) => app.name === 'family-comments')
  const app = existingApp ?? initializeApp(configuration, 'family-comments')
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (useEmulators && !existingApp) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  clients = { auth, db }
  return clients
}

export function validatePageId(pageId: string) {
  if (!VALID_ID.test(pageId)) throw new Error('연결 오류예요. 운영자에게 알려 주세요.')
}

// An account is created only when the reader saves a reaction.
export async function ensureAnonymousUser() {
  const { auth } = getClients()
  await auth.authStateReady()
  if (auth.currentUser) {
    if (!auth.currentUser.isAnonymous) {
      throw new Error('접속 정보에 문제가 생겼어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
    }
    return auth.currentUser
  }
  signingIn ??= signInAnonymously(auth).finally(() => { signingIn = undefined })
  return (await signingIn).user
}
