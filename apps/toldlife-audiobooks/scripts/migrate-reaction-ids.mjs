import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { legacyPageIds } from '../site/.vitepress/shared/episode-ids.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

function timestamp(document) {
  const value = document.fields?.updatedAt?.timestampValue
  const match = typeof value === 'string' && value.match(/^(.*:\d{2})(?:\.(\d{1,9}))?Z$/)
  if (!match || !Number.isFinite(Date.parse(`${match[1]}Z`))) throw new Error('반응 데이터의 저장 시각을 확인하세요.')
  return BigInt(Date.parse(`${match[1]}Z`)) * 1_000_000n + BigInt((match[2] || '').padEnd(9, '0'))
}

/** Copy existing reactions without changing UIDs, fields, or newer selections. */
export async function migrateReactionIds({ project, apply = false, emulator = false }) {
  if (typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error('--project에 Firebase 프로젝트 ID를 지정하세요.')
  if (emulator && !project.startsWith('demo-')) throw new Error('에뮬레이터는 demo- 프로젝트만 사용할 수 있습니다.')
  let token = 'owner'
  if (!emulator) {
    const require = createRequire(import.meta.url)
    const auth = require('firebase-tools/lib/auth')
    const account = auth.getProjectDefaultAccount(projectRoot)
    if (!account) throw new Error('Firebase CLI로 로그인한 뒤 실행하세요.')
    token = (await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
  }
  const origin = emulator ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'
  const root = `projects/${project}/databases/(default)/documents`
  async function request(resource, { body, missing = false } = {}) {
    const response = await fetch(`${origin}/v1/${resource}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (missing && response.status === 404) return null
    const data = await response.json()
    if (!response.ok) throw new Error(`Firestore ${response.status}: ${data.error?.message || '요청 실패'}`)
    return data
  }
  const sources = await Promise.all(Object.entries(legacyPageIds).map(async ([old, id]) => {
    const collection = `${root}/pages/memoir-${old}/reactions`
    const documents = []
    let pageToken = ''
    do {
      const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) })
      const page = await request(`${collection}?${query}`)
      for (const document of page.documents || []) {
        if (!document.name.startsWith(`${collection}/`)) throw new Error('예상하지 않은 반응 저장 경로입니다.')
        documents.push(document)
      }
      pageToken = page.nextPageToken || ''
    } while (pageToken)
    return { old, id, documents }
  }))
  const planned = await Promise.all(sources.flatMap(({ id, documents }) => documents.map(async source => {
    const uid = source.name.split('/').at(-1)
    const name = `${root}/pages/memoir-${id}/reactions/${uid}`
    const current = await request(name, { missing: true })
    if (current && timestamp(current) >= timestamp(source)) return null
    timestamp(source)
    return { update: { name, fields: source.fields }, currentDocument: current ? { updateTime: current.updateTime } : { exists: false } }
  })))
  const writes = planned.filter(Boolean)
  if (apply) {
    for (let index = 0; index < writes.length; index += 200) {
      await request(`${root}:commit`, { body: { writes: writes.slice(index, index + 200) } })
    }
  }
  const sourceDocuments = sources.reduce((sum, source) => sum + source.documents.length, 0)
  return { project, mode: apply ? 'apply' : 'dry-run', sourceDocuments, plannedWrites: writes.length, copied: apply ? writes.length : 0, alreadyCurrent: sourceDocuments - writes.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { project: { type: 'string' }, apply: { type: 'boolean' }, emulator: { type: 'boolean' } } })
    console.log(JSON.stringify(await migrateReactionIds(values), null, 2))
  } catch (error) {
    console.error(`[reaction-migration] ${error.message}`)
    process.exitCode = 1
  }
}
