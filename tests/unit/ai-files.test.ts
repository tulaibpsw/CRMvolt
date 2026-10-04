import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REQUIRED_DOCS, checkAiSetup, parseFrontmatter, syncSkills } from '../../scripts/lib/ai-files.mjs'

let root: string
const write = (rel: string, content: string) => {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
const skill = '---\nname: demo\ndescription: Demo skill used in tests\n---\n# Demo\n'

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai-check-'))
  write('AGENTS.md', '<!-- BEGIN:nextjs-agent-rules -->\nx\n<!-- END:nextjs-agent-rules -->\n# Volt On CRM — rules for AI agents\n')
  write('CLAUDE.md', '@AGENTS.md\n')
  for (const doc of REQUIRED_DOCS) write(doc, '# doc\n')
  write('.agents/skills/demo/SKILL.md', skill)
  write('.agents/rules/ui.md', '---\ntrigger: glob\nglobs: "src/**"\n---\nRead docs.\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('parseFrontmatter', () => {
  it('reads key/value pairs and returns null without frontmatter', () => {
    expect(parseFrontmatter(skill)).toEqual({ name: 'demo', description: 'Demo skill used in tests' })
    expect(parseFrontmatter('# none')).toBeNull()
  })
})

describe('checkAiSetup', () => {
  it('passes once skills are synced', () => {
    syncSkills(root)
    expect(checkAiSetup(root)).toEqual([])
  })

  it('flags unsynced and drifted Claude copies', () => {
    expect(checkAiSetup(root)).toContain('.claude/skills is out of sync — run npm run ai:sync')
    syncSkills(root)
    write('.claude/skills/demo/SKILL.md', `${skill}edited\n`)
    expect(checkAiSetup(root).some((p) => p.includes('differs'))).toBe(true)
  })

  it('flags an oversized AGENTS.md, a skill without description and a rule without trigger', () => {
    write('AGENTS.md', `<!-- BEGIN:nextjs-agent-rules -->\n# Volt On CRM — rules for AI agents\n${'x'.repeat(25_000)}`)
    write('.agents/skills/bad/SKILL.md', '---\nname: bad\n---\n')
    write('.agents/rules/db.md', '# no frontmatter\n')
    syncSkills(root)
    const problems = checkAiSetup(root)
    expect(problems.some((p) => p.includes('bytes'))).toBe(true)
    expect(problems).toContain('.agents/skills/bad/SKILL.md needs a description in its frontmatter')
    expect(problems).toContain('.agents/rules/db.md needs a trigger in its frontmatter')
  })
})
