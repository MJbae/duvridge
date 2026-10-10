import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/monorepo-ci.yml', import.meta.url), 'utf8')

function jobCondition(name) {
  const block = workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))
  assert.ok(block, `${name} job`)
  return block[1].match(/^ {4}if: (.+)$/m)?.[1] ?? ''
}

test('deployment follows the required check even when an optional check was skipped', () => {
  // A company-only push skips the ToldLife URL rehearsal. Without a status function GitHub carries
  // that skip through the required check and skips the deployment too, although everything passed.
  const condition = jobCondition('deploy')
  assert.match(condition, /!cancelled\(\)/)
  assert.match(condition, /needs\.required\.result == 'success'/)
  assert.match(condition, /github\.ref == 'refs\/heads\/main'/)
  assert.match(condition, /github\.event_name != 'pull_request'/)
})

test('ToldLife font browser checks gate deployment while company-only runs may skip them', () => {
  assert.match(jobCondition('fonts'), /contains\(needs\.plan\.outputs\.matrix, 'toldlife'\)/)
  assert.match(workflow, /needs: \[plan, repository, service, urls, fonts\]/)
  assert.match(workflow, /FONT_RESULT: \$\{\{ needs\.fonts\.result \}\}/)
  assert.match(workflow, /test "\$FONT_RESULT" = success \|\| test "\$FONT_RESULT" = skipped/)
})
