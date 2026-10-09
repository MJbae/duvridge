import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getAggregateFromServer,
  sum,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const PAGE = 'chronology'
const UID = 'family-member'
let environment

before(async () => {
  const hostAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  const [host, port] = hostAddress.split(':')
  environment = await initializeTestEnvironment({
    projectId: 'demo-family-library',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../rules/firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
})
after(async () => {
  await environment?.cleanup()
})

function anonymousDb(uid = UID) {
  return environment
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous', identities: {} },
    })
    .firestore()
}

function commentRef(db, page = PAGE, id = 'new-comment') {
  return doc(db, 'pages', page, 'comments', id)
}

function commentData(overrides = {}) {
  return {
    author: '큰딸',
    body: '그때 저도 함께 갔어요.\n비가 왔던 기억이 나요.',
    parentId: null,
    uid: UID,
    createdAt: serverTimestamp(),
    ...overrides,
  }
}

function submission(db, { page = PAGE, id = 'new-comment', uid = UID, overrides = {} } = {}) {
  const batch = writeBatch(db)
  batch.set(commentRef(db, page, id), commentData({ uid, ...overrides }))
  batch.set(doc(db, 'rateLimits', uid), {
    lastCommentAt: serverTimestamp(),
    lastCommentId: id,
    lastPageId: page,
  })
  return batch
}

async function seedComments() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(
      commentRef(db, PAGE, 'parent'),
      commentData({ createdAt: Timestamp.fromMillis(1_000) })
    )
    await setDoc(
      commentRef(db, 'other-page', 'elsewhere'),
      commentData({ createdAt: Timestamp.fromMillis(1_000) })
    )
    await setDoc(
      commentRef(db, PAGE, 'existing-reply'),
      commentData({ parentId: 'parent', createdAt: Timestamp.fromMillis(2_000) })
    )
  })
}

test('visitors can read one comment and a bounded latest-first page without signing in', async () => {
  await seedComments()
  const db = environment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(commentRef(db, PAGE, 'parent')))
  const result = await assertSucceeds(
    getDocs(
      query(collection(db, 'pages', PAGE, 'comments'), orderBy('createdAt', 'desc'), limit(30))
    )
  )
  assert.equal(result.size, 2)
  assert.equal(result.docs[0].id, 'existing-reply')
})

test('unbounded queries, oversized pages, and rate-limit reads are denied to visitors', async () => {
  const db = environment.unauthenticatedContext().firestore()
  await assertFails(getDocs(collection(db, 'pages', PAGE, 'comments')))
  await assertFails(getDocs(query(collection(db, 'pages', PAGE, 'comments'), limit(31))))
  await assertFails(getDoc(doc(db, 'rateLimits', UID)))
})

test('an anonymous visitor can atomically post a valid multiline comment and its server timestamp', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  const saved = (await getDoc(commentRef(db))).data()
  assert.equal(saved.author, '큰딸')
  assert.ok(saved.createdAt instanceof Timestamp)
  const rate = (await getDoc(doc(db, 'rateLimits', UID))).data()
  assert.equal(rate.lastCommentAt.toMillis(), saved.createdAt.toMillis())
})

test('unsigned and non-anonymous accounts cannot submit comments', async () => {
  await assertFails(submission(environment.unauthenticatedContext().firestore()).commit())
  const signedIn = environment
    .authenticatedContext(UID, { firebase: { sign_in_provider: 'password', identities: {} } })
    .firestore()
  await assertFails(submission(signedIn).commit())
})

test('direct writes without the paired cooldown record and forged UIDs are rejected', async () => {
  const db = anonymousDb()
  await assertFails(setDoc(commentRef(db), commentData()))
  await assertFails(submission(db, { overrides: { uid: 'someone-else' } }).commit())
  await assertFails(submission(db, { uid: 'someone-else' }).commit())
})

test('required fields, extra fields, empty input, and input size limits are enforced by the server', async () => {
  const db = anonymousDb()
  for (const overrides of [
    { author: '' },
    { author: '   ' },
    { author: 'a'.repeat(25) },
    { author: 'first\nsecond' },
    { body: '' },
    { body: ' \n\t ' },
    { body: 'a'.repeat(2001) },
    { body: 42 },
    { admin: true },
    { createdAt: Timestamp.fromMillis(0) },
  ]) {
    await assertFails(submission(db, { overrides }).commit())
  }
  const batch = writeBatch(db)
  const missing = commentData()
  delete missing.parentId
  batch.set(commentRef(db), missing)
  batch.set(doc(db, 'rateLimits', UID), {
    lastCommentAt: serverTimestamp(),
    lastCommentId: 'new-comment',
    lastPageId: PAGE,
  })
  await assertFails(batch.commit())
})

test('the maximum name and body lengths are accepted', async () => {
  await assertSucceeds(
    submission(anonymousDb(), {
      overrides: { author: 'a'.repeat(24), body: '가'.repeat(2000) },
    }).commit()
  )
})

test('a reply must point to an existing top-level comment on the same page', async () => {
  await seedComments()
  const db = anonymousDb()
  for (const parentId of ['missing', 'elsewhere', 'existing-reply', 'new-comment', 123]) {
    await assertFails(submission(db, { overrides: { parentId } }).commit())
  }
  await assertSucceeds(submission(db, { overrides: { parentId: 'parent' } }).commit())
})

test('a second comment within 15 seconds is rejected even on another page', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  await assertFails(submission(db, { page: 'other-page', id: 'too-soon' }).commit())
  assert.equal((await getDoc(commentRef(db, 'other-page', 'too-soon'))).exists(), false)
})

test('a visitor can comment again after the server cooldown has elapsed', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'rateLimits', UID), {
      lastCommentAt: Timestamp.fromMillis(Date.now() - 60_000),
      lastCommentId: 'older-comment',
      lastPageId: PAGE,
    })
  })
  await assertSucceeds(submission(anonymousDb()).commit())
})

test('a single rate record cannot authorize multiple comments in the same batch', async () => {
  const db = anonymousDb()
  const batch = submission(db)
  batch.set(commentRef(db, PAGE, 'extra-comment'), commentData())
  await assertFails(batch.commit())
})

test('rate records cannot be created independently, forged, erased, or read by another visitor', async () => {
  const db = anonymousDb()
  await assertFails(
    setDoc(doc(db, 'rateLimits', UID), {
      lastCommentAt: serverTimestamp(),
      lastCommentId: 'missing',
      lastPageId: PAGE,
    })
  )
  await assertSucceeds(submission(db).commit())
  await assertFails(
    updateDoc(doc(db, 'rateLimits', UID), { lastCommentAt: Timestamp.fromMillis(0) })
  )
  await assertFails(deleteDoc(doc(db, 'rateLimits', UID)))
  await assertFails(getDoc(doc(anonymousDb('another-member'), 'rateLimits', UID)))
  await assertFails(getDocs(query(collection(db, 'rateLimits'), limit(10))))
})

test('an author can edit a legacy comment immediately and receive a server update timestamp', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  const original = (await getDoc(commentRef(db))).data()
  assert.equal(original.updatedAt, undefined)
  await assertSucceeds(
    updateDoc(commentRef(db), {
      body: '기억을 다시 확인했어요.\n수정한 내용입니다.',
      updatedAt: serverTimestamp(),
    })
  )
  const saved = (await getDoc(commentRef(db))).data()
  assert.equal(saved.body, '기억을 다시 확인했어요.\n수정한 내용입니다.')
  assert.ok(saved.updatedAt instanceof Timestamp)
  assert.ok(saved.updatedAt.toMillis() >= original.createdAt.toMillis())
  assert.deepEqual(
    { ...saved, body: original.body, updatedAt: undefined },
    { ...original, updatedAt: undefined }
  )
  // Editing does not reset or circumvent the global create cooldown.
  const rate = (await getDoc(doc(db, 'rateLimits', UID))).data()
  assert.equal(rate.lastCommentAt.toMillis(), original.createdAt.toMillis())
  await assertFails(submission(db, { page: 'other-page', id: 'still-too-soon' }).commit())
})

test('editing requires a fresh server timestamp on every update', async () => {
  await seedComments()
  const ref = commentRef(anonymousDb(), PAGE, 'parent')
  await assertFails(updateDoc(ref, { body: 'missing timestamp' }))
  for (const updatedAt of [null, 'now', Timestamp.fromMillis(1_000), deleteField()]) {
    await assertFails(updateDoc(ref, { body: 'wrong timestamp', updatedAt }))
  }
  await assertSucceeds(updateDoc(ref, { body: 'first edit', updatedAt: serverTimestamp() }))
  const previousTimestamp = (await getDoc(ref)).data().updatedAt
  await assertFails(updateDoc(ref, { body: 'stale timestamp', updatedAt: previousTimestamp }))
  await assertSucceeds(updateDoc(ref, { body: 'second edit', updatedAt: serverTimestamp() }))
})

test('only the owning anonymous UID may edit or delete, even when names match', async () => {
  await seedComments()
  const otherDb = anonymousDb('another-member')
  const unsignedDb = environment.unauthenticatedContext().firestore()
  const nonAnonymousDb = environment
    .authenticatedContext(UID, { firebase: { sign_in_provider: 'password', identities: {} } })
    .firestore()
  for (const db of [otherDb, unsignedDb, nonAnonymousDb]) {
    const ref = commentRef(db, PAGE, 'parent')
    await assertFails(updateDoc(ref, { body: 'forged edit', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(ref))
  }
  assert.equal(
    (await getDoc(commentRef(anonymousDb(), PAGE, 'parent'))).data().body,
    commentData().body
  )
})

test('editing cannot alter or remove identity, creation time, reply links, or add fields', async () => {
  await seedComments()
  const ref = commentRef(anonymousDb(), PAGE, 'parent')
  for (const changes of [
    { author: '다른 이름' },
    { author: deleteField() },
    { uid: 'another-member' },
    { uid: deleteField() },
    { createdAt: serverTimestamp() },
    { createdAt: deleteField() },
    { parentId: 'existing-reply' },
    { parentId: deleteField() },
    { admin: true },
  ]) {
    await assertFails(updateDoc(ref, { body: 'edited', updatedAt: serverTimestamp(), ...changes }))
  }
  await assertFails(setDoc(ref, { body: 'replacement', updatedAt: serverTimestamp() }))
})

test('edited bodies must be nonblank strings of at most 2,000 characters', async () => {
  await seedComments()
  const ref = commentRef(anonymousDb(), PAGE, 'parent')
  for (const body of ['', ' \n\t ', '가'.repeat(2001), 42, null, deleteField()]) {
    await assertFails(updateDoc(ref, { body, updatedAt: serverTimestamp() }))
  }
  await assertSucceeds(updateDoc(ref, { body: '가'.repeat(2000), updatedAt: serverTimestamp() }))
})

test('an author can hard-delete immediately without resetting the create cooldown', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  const rate = (await getDoc(doc(db, 'rateLimits', UID))).data()
  await assertSucceeds(deleteDoc(commentRef(db)))
  assert.equal((await getDoc(commentRef(db))).exists(), false)
  assert.deepEqual((await getDoc(doc(db, 'rateLimits', UID))).data(), rate)
  await assertFails(submission(db, { id: 'still-too-soon' }).commit())
  // An update never recreates a deleted document.
  await assertFails(updateDoc(commentRef(db), { body: 'changed' }))
})

test('deleting a parent preserves other visitors replies and their owners can still edit and delete them', async () => {
  await seedComments()
  const replyUid = 'another-member'
  const ownerDb = anonymousDb()
  const replyDb = anonymousDb(replyUid)
  await assertSucceeds(
    submission(replyDb, {
      id: 'another-reply',
      uid: replyUid,
      overrides: { parentId: 'parent' },
    }).commit()
  )
  const replyRef = commentRef(replyDb, PAGE, 'another-reply')
  const originalReply = (await getDoc(replyRef)).data()
  await assertSucceeds(deleteDoc(commentRef(ownerDb, PAGE, 'parent')))
  assert.equal((await getDoc(commentRef(ownerDb, PAGE, 'parent'))).exists(), false)
  assert.deepEqual((await getDoc(replyRef)).data(), originalReply)
  await assertFails(deleteDoc(commentRef(ownerDb, PAGE, 'another-reply')))
  await assertFails(
    updateDoc(commentRef(ownerDb, PAGE, 'another-reply'), {
      body: 'parent owner cannot edit replies',
      updatedAt: serverTimestamp(),
    })
  )
  await assertSucceeds(
    updateDoc(replyRef, {
      body: '부모 댓글이 없어도 고칠 수 있어요.',
      updatedAt: serverTimestamp(),
    })
  )
  assert.equal((await getDoc(replyRef)).data().parentId, 'parent')
  await assertSucceeds(deleteDoc(replyRef))
  assert.equal((await getDoc(replyRef)).exists(), false)
  assert.equal((await getDoc(commentRef(ownerDb, PAGE, 'existing-reply'))).exists(), true)
})

test('comment ownership does not authorize writes to unrelated documents', async () => {
  const db = anonymousDb()
  await assertFails(setDoc(doc(db, 'pages', PAGE), { published: true }))
  await assertFails(setDoc(doc(db, 'private', 'settings'), { admin: true }))
})

const reactionData = (overrides = {}) => ({ heart: 1, like: 0, moved: 0, wow: 0, remember: 0, updatedAt: serverTimestamp(), ...overrides })
const reactionRef = (db, uid = UID) => doc(db, 'pages', 'memoir-ep01', 'reactions', uid)

test('one anonymous visitor owns one reaction and public readers can aggregate all five counts', async () => {
  const db = anonymousDb()
  await assertSucceeds(setDoc(reactionRef(db), reactionData()))
  const publicDb = environment.unauthenticatedContext().firestore()
  const aggregate = await assertSucceeds(getAggregateFromServer(collection(publicDb, 'pages', 'memoir-ep01', 'reactions'), { heart: sum('heart'), like: sum('like'), moved: sum('moved'), wow: sum('wow'), remember: sum('remember') }))
  assert.deepEqual(aggregate.data(), { heart: 1, like: 0, moved: 0, wow: 0, remember: 0 })
  await assertFails(setDoc(reactionRef(anonymousDb('another')), reactionData({ heart: 0, like: 1 })))
  await assertFails(deleteDoc(reactionRef(db)))
})

test('reaction values must be a complete one-hot integer record with a server timestamp', async () => {
  const db = anonymousDb()
  for (const overrides of [{ heart: 2 }, { heart: -1 }, { heart: 0.5 }, { heart: true }, { like: 1 }, { extra: 1 }, { updatedAt: Timestamp.fromMillis(1000) }]) await assertFails(setDoc(reactionRef(db), reactionData(overrides)))
  const missing = reactionData(); delete missing.remember
  await assertFails(setDoc(reactionRef(db), missing))
  await assertFails(setDoc(reactionRef(environment.unauthenticatedContext().firestore()), reactionData()))
  const passwordDb = environment.authenticatedContext(UID, { firebase: { sign_in_provider: 'password' } }).firestore()
  await assertFails(setDoc(reactionRef(passwordDb), reactionData()))
})

test('reactions enforce a one-second update interval and can be changed or cancelled', async () => {
  const db = anonymousDb()
  await assertSucceeds(setDoc(reactionRef(db), reactionData()))
  await assertFails(setDoc(reactionRef(db), reactionData({ heart: 0, like: 1 })))
  await environment.withSecurityRulesDisabled(async context => updateDoc(reactionRef(context.firestore()), { updatedAt: Timestamp.fromMillis(Date.now() - 2000) }))
  await assertSucceeds(setDoc(reactionRef(db), reactionData({ heart: 0, remember: 1 })))
  await environment.withSecurityRulesDisabled(async context => updateDoc(reactionRef(context.firestore()), { updatedAt: Timestamp.fromMillis(Date.now() - 2000) }))
  await assertSucceeds(setDoc(reactionRef(db), reactionData({ heart: 0 })))
})

function heartBatch(db, selected, { delta = selected ? 1 : -1, extra = {} } = {}) {
  const heart = doc(commentRef(db, PAGE, 'parent'), 'hearts', 'heart-reader')
  const batch = writeBatch(db)
  if (selected) batch.set(heart, { createdAt: serverTimestamp() })
  else batch.delete(heart)
  batch.update(commentRef(db, PAGE, 'parent'), { heartCount: increment(delta), ...extra })
  return batch
}

test('comment hearts atomically add and remove exactly one count, including increment transforms', async () => {
  await seedComments()
  const db = anonymousDb('heart-reader')
  await assertSucceeds(heartBatch(db, true).commit())
  assert.equal((await getDoc(commentRef(db, PAGE, 'parent'))).data().heartCount, 1)
  await assertFails(heartBatch(db, true).commit())
  await assertSucceeds(heartBatch(db, false).commit())
  assert.equal((await getDoc(commentRef(db, PAGE, 'parent'))).data().heartCount, 0)
  await assertFails(heartBatch(db, false).commit())
})

test('hearts deny unpaired writes, forged counts, changed comment fields, self hearts, and other UIDs', async () => {
  await seedComments()
  const db = anonymousDb('heart-reader')
  const parent = commentRef(db, PAGE, 'parent'), heart = doc(parent, 'hearts', 'heart-reader')
  await assertFails(setDoc(heart, { createdAt: serverTimestamp() }))
  await assertFails(updateDoc(parent, { heartCount: increment(1) }))
  await assertFails(heartBatch(db, true, { delta: 2 }).commit())
  await assertFails(heartBatch(db, true, { extra: { body: '위조한 본문' } }).commit())
  const selfDb = anonymousDb()
  const selfBatch = writeBatch(selfDb)
  selfBatch.set(doc(commentRef(selfDb, PAGE, 'parent'), 'hearts', UID), { createdAt: serverTimestamp() })
  selfBatch.update(commentRef(selfDb, PAGE, 'parent'), { heartCount: increment(1) })
  await assertFails(selfBatch.commit())
  await assertSucceeds(heartBatch(db, true).commit())
  await assertFails(getDoc(doc(commentRef(anonymousDb('stranger'), PAGE, 'parent'), 'hearts', 'heart-reader')))
  await assertFails(getDocs(collection(parent, 'hearts')))
  await assertFails(updateDoc(heart, { createdAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(commentRef(selfDb, PAGE, 'parent'), { body: '하트가 있어도 작성자는 수정한다.', updatedAt: serverTimestamp() }))
  assert.equal((await getDoc(parent)).data().heartCount, 1)
})

test('deleted comments cannot accept or cancel hearts and legacy comment namespaces still work', async () => {
  await seedComments()
  const db = anonymousDb('heart-reader')
  await assertSucceeds(heartBatch(db, true).commit())
  await assertSucceeds(deleteDoc(commentRef(anonymousDb(), PAGE, 'parent')))
  await assertFails(heartBatch(db, false).commit())
  await assertSucceeds(submission(anonymousDb(), { page: 'life-prologue', id: 'original-site' }).commit())
})
