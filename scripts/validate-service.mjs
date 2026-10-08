#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(readFileSync(resolve(root, 'service-registry.json'), 'utf8'))
const service = registry.services.find(service => service.id === process.argv[2])
if (!service) throw new Error(`Unknown service: ${process.argv[2]}`)
const manifest = JSON.parse(readFileSync(resolve(root, service.path, 'package.json'), 'utf8'))
if (process.env.REQUIRE_FIREBASE_CONFIG === 'true' && manifest.dependencies?.firebase) {
  const missing = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
    .filter(name => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Missing production Firebase variables: ${missing.join(', ')}`)
}
const env = {
  ...process.env,
  SITE_BASE: service.siteBase,
  SITE_ORIGIN: registry.deployGroups[service.deployGroup].origin,
  VITE_USE_FIREBASE_EMULATORS: 'false',
}
for (const check of service.checks) {
  const result = spawnSync('npm', ['run', check, '--workspace', service.workspace], { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
