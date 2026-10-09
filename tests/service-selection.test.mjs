import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { affected, workspaceGraph, diffPaths } from '../scripts/select-affected-services.mjs'

const registry = {
  globalPaths: ['package.json', 'package-lock.json', 'service-registry.json', 'scripts/', 'tests/', '.github/workflows/'],
  deployGroups: { company: { project: 'company' }, toldlife: { project: 'toldlife' } },
  services: [
    { id: 'company', path: 'apps/company-site', workspace: 'company', deployGroup: 'company' },
    { id: 'portal', path: 'apps/portal', workspace: 'portal', deployGroup: 'toldlife', watchedPaths: ['apps/company-site/assets/brand/'] },
    { id: 'novels', path: 'apps/novels', workspace: 'novels', deployGroup: 'toldlife' },
    { id: 'audio', path: 'apps/audio/web', workspace: 'audio', deployGroup: 'toldlife' },
  ],
}
const graph = new Map([
  ['company', { path: 'apps/company-site', dependencies: [] }],
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
  assert.deepEqual(affected(['apps/company-site/assets/brand/logo.png'], registry, graph).deployGroups, ['company', 'toldlife'])
})

test('docs and audio production tools do not deploy the website', () => {
  assert.deepEqual(affected(['README.md', 'docs/ci-cd.md', 'apps/audio/tools/narrate.py', 'apps/novels/README.md', 'apps/novels/docs/readme.png'], registry, graph).services, [])
})

test('root dependency, policy, and CI tooling changes validate all services', () => {
  for (const path of ['package-lock.json', 'service-registry.json', 'scripts/select-affected-services.mjs', 'tests/test_build.py', '.github/workflows/monorepo-ci.yml']) {
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

test('service registry rejects names and paths that target a different workspace', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const actual = JSON.parse(readFileSync(new URL('../service-registry.json', import.meta.url), 'utf8'))
  workspaceGraph(root, actual)
  const wrongName = structuredClone(actual)
  wrongName.services[0].id = 'old-project-name'
  assert.throws(() => workspaceGraph(root, wrongName), /functional name/)
  const wrongWorkspace = structuredClone(actual)
  wrongWorkspace.services[0].workspace = actual.services[1].workspace
  assert.throws(() => workspaceGraph(root, wrongWorkspace), /workspace\/path mismatch/)
})

test('editorial book sources outside packages validate both declared readers and leave company out', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const actual = JSON.parse(readFileSync(new URL('../service-registry.json', import.meta.url), 'utf8'))
  const workspace = workspaceGraph(root, actual)
  for (const filename of ['manuscript.md', 'book.json', 'illustrations/manifest.json', 'public/images/episodes/ep01-01-720.jpg']) {
    const plan = affected([`content/books/bae-byunghee/${filename}`], actual, workspace)
    assert.deepEqual(plan.services, ['toldlife-portal', 'toldlife-novels', 'toldlife-audiobooks', 'toldlife-videos'])
    assert.deepEqual(plan.deployGroups, ['toldlife'])
  }
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
