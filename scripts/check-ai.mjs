import { checkAiSetup } from './lib/ai-files.mjs'

const problems = checkAiSetup(process.cwd())
if (problems.length) {
  console.error(`AI setup check failed:\n${problems.map((p) => ` - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('AI setup check passed')
