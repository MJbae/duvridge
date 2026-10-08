#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(readFileSync(resolve(root, 'service-registry.json'), 'utf8'))
const group = registry.deployGroups[process.argv[2]]
if (!group) throw new Error(`Unknown deployment group: ${process.argv[2]}`)
if (group.assembleCommand.length) {
  const [command, ...args] = group.assembleCommand
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const output = resolve(root, group.output)
if (!existsSync(resolve(output, 'index.html'))) throw new Error(`Missing project home: ${output}`)
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Deployment symlink is not allowed: ${path}`)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const publicFiles = files(output)
if (publicFiles.length > 20000) throw new Error('Cloudflare Pages file count exceeds 20,000')
for (const path of publicFiles) {
  if (statSync(path).size > 25 * 1024 * 1024) throw new Error(`Cloudflare Pages asset exceeds 25 MiB: ${path}`)
  if (/(^|\/)(\.env[^/]*|package(?:-lock)?\.json)$/.test(path)) throw new Error(`Refusing source/config asset: ${path}`)
}
const marker = resolve(output, 'deployment.json')
const manifest = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : { schemaVersion: 1 }
manifest.sourceRevision = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
manifest.sourceDirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
manifest.group = process.argv[2]
writeFileSync(marker, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Prepared complete ${process.argv[2]} deployment from ${manifest.sourceRevision.slice(0, 12)}`)
