import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { affected, workspaceGraph, diffPaths } from '../scripts/affected.mjs'

const registry = {
  globalPaths: ['package.json', 'package-lock.json', 'services.json', 'scripts/', 'tests/', '.github/workflows/'],
  deployGroups: { company: { project: 'company' }, toldlife: { project: 'toldlife' } },
  services: [
    { id: 'company', path: 'apps/company', workspace: 'company', deployGroup: 'company' },
    { id: 'portal', path: 'apps/portal', workspace: 'portal', deployGroup: 'toldlife', watchedPaths: ['apps/company/assets/brand/'] },
    { id: 'novels', path: 'apps/novels', workspace: 'novels', deployGroup: 'toldlife' },
    { id: 'audio', path: 'apps/audio/web', workspace: 'audio', deployGroup: 'toldlife' },
  ],
}
const graph = new Map([
  ['company', { path: 'apps/company', dependencies: [] }],
  ['portal', { path: 'apps/portal', dependencies: [] }],
  ['novels', { path: 'apps/novels', dependencies: ['reader'] }],
  ['audio', { path: 'apps/audio/web', dependencies: ['reader'] }],
  ['reader', { path: 'packages/reader', dependencies: ['content'] }],
  ['content', { path: 'packages/content', dependencies: [] }],
])

test('one reader change builds a complete ToldLife snapshot and leaves company out', () => {
  const plan = affected(['apps/audio/web/site/player.vue'], registry, graph)
  assert.deepEqual(plan.services, ['audio'])
  assert.deepEqual(plan.validationMatrix.include.map(item => item.service), ['audio'])
  assert.deepEqual(plan.deployGroups, ['toldlife'])
  assert.deepEqual(plan.matrix.include.map(item => item.service), ['portal', 'novels', 'audio'])
})

test('shared content reaches both consumers through the transitive dependency graph', () => {
  const plan = affected(['packages/content/manuscript.md'], registry, graph)
  assert.deepEqual(plan.services, ['novels', 'audio'])
  assert.deepEqual(plan.packages, ['content', 'reader'])
})

test('company assets used by the portal affect both independent deployment groups', () => {
  assert.deepEqual(affected(['apps/company/assets/brand/logo.png'], registry, graph).deployGroups, ['company', 'toldlife'])
})

test('docs and audio production tools do not deploy the website', () => {
  assert.deepEqual(affected(['README.md', 'docs/ci-cd.md', 'apps/audio/tools/narrate.py', 'apps/novels/README.md', 'apps/novels/docs/readme.png'], registry, graph).services, [])
})

test('root dependency, policy, and CI tooling changes validate all services', () => {
  for (const path of ['package-lock.json', 'services.json', 'scripts/affected.mjs', 'tests/test_build.py', '.github/workflows/ci.yml']) {
    assert.deepEqual(affected([path], registry, graph).services, ['company', 'portal', 'novels', 'audio'], path)
  }
})

test('service path boundaries do not match similarly prefixed directories', () => {
  assert.deepEqual(affected(['apps/novels-other/src.js'], registry, graph).services, [])
})

test('actual package manifests provide dependencies without a second hand-maintained graph', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'workspace-graph-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [name, entry] of graph) {
    mkdirSync(resolve(root, entry.path), { recursive: true })
    writeFileSync(resolve(root, entry.path, 'package.json'), JSON.stringify({ name, dependencies: Object.fromEntries(entry.dependencies.map(dep => [dep, '*'])) }))
  }
  const actual = workspaceGraph(root, registry)
  assert.deepEqual(affected(['packages/content/deleted.md'], registry, actual).services, ['novels', 'audio'])
})

test('git diffs retain both renamed paths and deleted paths', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'affected-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.email', 'ci@example.invalid')
  git('config', 'user.name', 'CI test')
  mkdirSync(resolve(root, 'apps/novels'), { recursive: true })
  mkdirSync(resolve(root, 'apps/audio/web'), { recursive: true })
  writeFileSync(resolve(root, 'apps/novels/old.txt'), 'stable content\n')
  writeFileSync(resolve(root, 'apps/audio/web/deleted.txt'), 'to delete\n')
  git('add', '.')
  git('commit', '-qm', 'before')
  const before = git('rev-parse', 'HEAD')
  git('mv', 'apps/novels/old.txt', 'apps/audio/web/renamed.txt')
  git('rm', 'apps/audio/web/deleted.txt')
  git('commit', '-qm', 'after')
  const paths = diffPaths(before, 'HEAD', root)
  assert.deepEqual(new Set(paths), new Set(['apps/novels/old.txt', 'apps/audio/web/renamed.txt', 'apps/audio/web/deleted.txt']))
  assert.deepEqual(affected(paths, registry, graph).services, ['novels', 'audio'])
})
