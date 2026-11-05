import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { input, main } from '../../../lib/runtime.ts'
import { deploy, reportResults } from './deploy.ts'
import { createGithubClient } from './github-client.ts'
import { parseManifest } from './manifest.ts'

/** Stores a repo secret through the gh CLI (encryption included); the value goes through stdin only. */
const setSecretWithGh = (token: string) => (repo: string, name: string, value: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('gh', ['secret', 'set', name, '--repo', repo], { env: { ...process.env, GH_TOKEN: token }, stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`gh secret set failed for ${repo}: ${stderr.trim().slice(0, 200)}`))))
    child.stdin.end(value)
  })

void main(async () => {
  const token = input('token')
  const secretValue = input('secret_value')
  const dryRun = input('dry_run') !== 'false' // safe by default
  const org = input('org') || github.context.repo.owner
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const templatesDir = join(workspace, input('templates_dir') || '.github/managed-workflows')
  const manifestPath = join(workspace, input('manifest_path') || '.github/managed-workflows/manifest.json')

  const templates = new Map<string, string>()
  for (const name of readdirSync(templatesDir).filter((n) => /^org-[a-z0-9-]+\.yml$/.test(n))) templates.set(name, readFileSync(join(templatesDir, name), 'utf8'))
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), [...templates.keys()])

  const client = createGithubClient(github.getOctokit(token), org, setSecretWithGh(token))
  const filter = input('repos').split(',').map((s) => s.trim()).filter(Boolean)
  const results = await deploy(core, client, templates, manifest, { dryRun, repoFilter: filter, rotateSecret: input('rotate_secret') === 'true', secretValue })
  await reportResults(core, results, dryRun)
})
