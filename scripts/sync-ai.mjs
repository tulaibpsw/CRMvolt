import { syncSkills } from './lib/ai-files.mjs'

const count = syncSkills(process.cwd())
console.log(`Synced ${count} skill file(s) from .agents/skills to .claude/skills`)
