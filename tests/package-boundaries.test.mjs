import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { workspaceGraph, affected } from '../scripts/select-affected-services.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const registry = JSON.parse(readFileSync(path.join(root, 'service-registry.json'), 'utf8'))

test('shared package dependencies form a cycle-free functional graph', () => {
  const graph = workspaceGraph(root, registry)
  const active = new Set(), done = new Set()
  const visit = name => {
    if (done.has(name)) return
    assert(!active.has(name), `Workspace dependency cycle at ${name}`)
    active.add(name)
    for (const dependency of graph.get(name).dependencies) if (graph.has(dependency)) visit(dependency)
    active.delete(name); done.add(name)
  }
  for (const name of graph.keys()) visit(name)
})

test('shared packages contain code rather than authored manuscripts or media', () => {
  const inspect = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        assert(!['lib', 'shared', 'public', 'reference-images', 'source-images'].includes(entry.name), `Use a functional code boundary: ${file}`)
        inspect(file)
      } else {
        assert(!/\.(?:png|jpe?g|webp|mp3|srt|mp4)$/i.test(entry.name), `Authored media belongs in content: ${file}`)
        assert(entry.name !== 'manuscript.md', `Authored prose belongs in content: ${file}`)
      }
    }
  }
  inspect(path.join(root, 'packages'))
})

test('UI and reaction changes reach only their declared reader consumers', () => {
  const graph = workspaceGraph(root, registry)
  for (const directory of ['content-processing', 'reader-ui', 'reader-reactions', 'vitepress-reader']) {
    const plan = affected([`packages/${directory}/src/example.ts`], registry, graph)
    assert.deepEqual(plan.services, [...(['content-processing', 'reader-ui'].includes(directory) ? ['toldlife-portal'] : []), 'toldlife-novels', 'toldlife-audiobooks', 'toldlife-videos'])
    assert.deepEqual(plan.deployGroups, ['toldlife'])
  }
})
