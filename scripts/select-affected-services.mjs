#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs'
import { resolve, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const normalized = path => path.replaceAll('\\', '/').replace(/^\.\//, '')
const contains = (file, path) => file === path.replace(/\/$/, '') || file.startsWith(path.replace(/\/$/, '') + '/')

export function workspaceGraph(root, registry) {
  const manifests = registry.services.map(service => resolve(root, service.path, 'package.json'))
  const packages = resolve(root, 'packages')
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      const manifest = resolve(packages, entry.name, 'package.json')
      if (entry.isDirectory() && existsSync(manifest)) manifests.push(manifest)
    }
  }
  const graph = new Map()
  for (const manifest of new Set(manifests)) {
    if (!existsSync(manifest)) throw new Error(`Missing workspace manifest: ${relative(root, manifest)}`)
    const json = readJson(manifest)
    if (!json.name || graph.has(json.name)) throw new Error(`Missing or duplicate workspace name: ${manifest}`)
    graph.set(json.name, {
      path: normalized(relative(root, dirname(manifest))),
      dependencies: Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.optionalDependencies, ...json.peerDependencies }),
    })
  }
  for (const service of registry.services) {
    if (!graph.has(service.workspace)) throw new Error(`Unknown service workspace: ${service.workspace}`)
    const workspace = graph.get(service.workspace)
    if (workspace.path !== normalized(service.path))
      throw new Error(`Service workspace/path mismatch: ${service.id}`)
    if (registry.workspaceScope) {
      const role = basename(workspace.path)
      if (service.id !== role || service.workspace !== `${registry.workspaceScope}/${role}`)
        throw new Error(`Service folder, id and workspace must share the functional name: ${service.path}`)
    }
  }
  return graph
}

export function affected(paths, registry, graph, { all = false } = {}) {
  const ignored = [...(registry.ignoredPaths ?? []), ...[...graph.values()].flatMap(node => [`${node.path}/README.md`, `${node.path}/docs/`])]
  const changed = [...new Set(paths.map(normalized))].filter(file => !ignored.some(path => path.endsWith('/') ? contains(file, path) : file === path))
  const global = all || changed.some(file => registry.globalPaths.some(path => path.endsWith('/') ? contains(file, path) : file === path))
  const impacted = new Set()
  for (const [name, node] of graph) {
    if (global || changed.some(file => contains(file, node.path))) impacted.add(name)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const [name, node] of graph) {
      if (!impacted.has(name) && node.dependencies.some(dependency => impacted.has(dependency))) {
        impacted.add(name)
        grew = true
      }
    }
  }
  const services = registry.services.filter(service => global || impacted.has(service.workspace)
    || changed.some(file => (service.watchedPaths ?? []).some(path => contains(file, path))))
  const deployGroups = [...new Set(services.map(service => service.deployGroup))]
  // A Pages deployment replaces a project snapshot, so build all members of each affected group.
  const buildServices = registry.services.filter(service => deployGroups.includes(service.deployGroup))
  return {
    services: services.map(service => service.id), deployGroups,
    packages: [...impacted].filter(name => !registry.services.some(service => service.workspace === name)).sort(),
    validationMatrix: { include: services.map(service => ({
      service: service.id, workspace: service.workspace, artifactPath: service.artifactPath ?? '',
    })) },
    matrix: { include: buildServices.map(service => ({
      service: service.id, workspace: service.workspace, artifactPath: service.artifactPath ?? '',
    })) },
    deploymentMatrix: { include: deployGroups.map(group => ({ group, ...registry.deployGroups[group] })) },
  }
}

export function diffPaths(base, head, root = ROOT) {
  const output = execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', base, head, '--'], { cwd: root, encoding: 'utf8' })
  const fields = output.split('\0')
  const paths = []
  for (let index = 0; index < fields.length && fields[index];) {
    const status = fields[index++]
    paths.push(fields[index++])
    if (/^[RC]/.test(status)) paths.push(fields[index++])
  }
  return paths
}

function main() {
  const args = process.argv.slice(2)
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  const registry = readJson(resolve(ROOT, 'service-registry.json'))
  const base = option('--base')
  const head = option('--head') ?? 'HEAD'
  let all = args.includes('--all') || !base || /^0+$/.test(base)
  let paths = []
  if (!all) {
    // An unavailable history must never silently omit a service from CI.
    try { paths = diffPaths(base, head) } catch { all = true }
  }
  const result = affected(paths, registry, workspaceGraph(ROOT, registry), { all })
  console.log(JSON.stringify(result, null, 2))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `matrix=${JSON.stringify(result.matrix)}`, `has_services=${result.matrix.include.length > 0}`,
      `validation_matrix=${JSON.stringify(result.validationMatrix)}`,
      `deployment_matrix=${JSON.stringify(result.deploymentMatrix)}`,
      `company=${result.deployGroups.includes('company')}`, `toldlife=${result.deployGroups.includes('toldlife')}`,
      `services=${JSON.stringify(result.services)}`,
    ].join('\n') + '\n')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
