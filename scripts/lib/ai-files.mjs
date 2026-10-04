// Helpers for the shared AI setup: AGENTS.md is the rulebook; .agents/skills is canonical and
// is copied to .claude/skills (Claude Code). Used by scripts/sync-ai.mjs and scripts/check-ai.mjs.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export const AGENTS_MAX_BYTES = 24_000
export const REQUIRED_DOCS = [
  'docs/ai/architecture.md',
  'docs/ai/design-system.md',
  'docs/ai/components.md',
  'docs/ai/schema.md',
  'docs/ai/integrations.md',
  'docs/ai/workflow.md',
]

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return null
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return data
}

export function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(relative(dir, path).split('\\').join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

export function syncSkills(root) {
  const src = join(root, '.agents/skills')
  const dest = join(root, '.claude/skills')
  rmSync(dest, { recursive: true, force: true })
  for (const file of listFiles(src)) {
    const target = join(dest, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(src, file), target)
  }
  return listFiles(dest).length
}

export function checkAiSetup(root) {
  const problems = []
  const agentsPath = join(root, 'AGENTS.md')
  if (!existsSync(agentsPath)) problems.push('AGENTS.md is missing')
  else {
    const agents = readFileSync(agentsPath, 'utf8')
    const size = Buffer.byteLength(agents, 'utf8')
    if (size > AGENTS_MAX_BYTES) problems.push(`AGENTS.md is ${size} bytes — keep it under ${AGENTS_MAX_BYTES} (Antigravity limit)`)
    if (!agents.includes('<!-- BEGIN:nextjs-agent-rules -->')) problems.push('AGENTS.md lost the Next.js managed block')
    if (!agents.includes('# Volt On CRM — rules for AI agents')) problems.push('AGENTS.md is missing the project rules section')
  }
  const claudePath = join(root, 'CLAUDE.md')
  if (!existsSync(claudePath) || !readFileSync(claudePath, 'utf8').includes('@AGENTS.md')) problems.push('CLAUDE.md must import @AGENTS.md')
  for (const doc of REQUIRED_DOCS) if (!existsSync(join(root, doc))) problems.push(`${doc} is missing`)

  const skillsDir = join(root, '.agents/skills')
  const skillNames = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory()) : []
  if (skillNames.length === 0) problems.push('.agents/skills has no skills')
  for (const name of skillNames) {
    const file = join(skillsDir, name, 'SKILL.md')
    if (!existsSync(file)) {
      problems.push(`.agents/skills/${name}/SKILL.md is missing`)
      continue
    }
    const fm = parseFrontmatter(readFileSync(file, 'utf8'))
    if (!fm?.description) problems.push(`.agents/skills/${name}/SKILL.md needs a description in its frontmatter`)
    if (fm?.name && fm.name !== name) problems.push(`.agents/skills/${name}/SKILL.md name "${fm.name}" must match its folder`)
  }

  const canonical = listFiles(skillsDir)
  const copies = listFiles(join(root, '.claude/skills'))
  if (canonical.join('|') !== copies.join('|')) problems.push('.claude/skills is out of sync — run npm run ai:sync')
  else {
    for (const f of canonical) {
      if (readFileSync(join(skillsDir, f), 'utf8') !== readFileSync(join(root, '.claude/skills', f), 'utf8')) {
        problems.push(`.claude/skills/${f} differs from .agents/skills — run npm run ai:sync`)
      }
    }
  }

  const rulesDir = join(root, '.agents/rules')
  for (const f of listFiles(rulesDir)) {
    const fm = parseFrontmatter(readFileSync(join(rulesDir, f), 'utf8'))
    if (!fm?.trigger) problems.push(`.agents/rules/${f} needs a trigger in its frontmatter`)
  }
  return problems
}
