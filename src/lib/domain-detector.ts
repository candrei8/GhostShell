import { SubAgentDomain } from './types'

interface DomainRule {
  domain: SubAgentDomain
  keywords: RegExp
}

const domainRules: DomainRule[] = [
  {
    domain: 'frontend',
    keywords: /\b(react|component|css|tailwind|ui|layout|page|tsx|jsx|styled|html|dom|svg|canvas|animation|framer|lucide|icon)\b/i,
  },
  {
    domain: 'backend',
    keywords: /\b(api|server|route|controller|middleware|endpoint|express|fastify|handler|socket|graphql|rest|http)\b/i,
  },
  {
    domain: 'database',
    keywords: /\b(db|database|migration|schema|sql|prisma|model|query|table|sequelize|mongoose|redis|postgres|sqlite)\b/i,
  },
  {
    domain: 'testing',
    keywords: /\b(test|spec|jest|vitest|cypress|e2e|playwright|mock|assert|expect|coverage|fixture)\b/i,
  },
  {
    domain: 'devops',
    keywords: /\b(docker|ci|deploy|pipeline|github.action|workflow|nginx|k8s|kubernetes|terraform|ansible|helm)\b/i,
  },
  {
    domain: 'docs',
    keywords: /\b(readme|doc|changelog|license|contributing|wiki|jsdoc|typedoc)\b/i,
  },
  {
    domain: 'config',
    keywords: /\b(config|env|tsconfig|eslint|prettier|babel|webpack|vite\.config|package\.json|rollup)\b/i,
  },
]

export function detectDomain(description: string, filePaths: string[] = []): SubAgentDomain {
  const combined = [description, ...filePaths].join(' ')

  for (const rule of domainRules) {
    if (rule.keywords.test(combined)) {
      return rule.domain
    }
  }

  return 'general'
}

export const domainConfig: Record<SubAgentDomain, { label: string; color: string; bgColor: string }> = {
  frontend: { label: 'Frontend', color: 'text-cyan-400', bgColor: 'bg-cyan-400/15' },
  backend: { label: 'Backend', color: 'text-orange-400', bgColor: 'bg-orange-400/15' },
  database: { label: 'Database', color: 'text-yellow-400', bgColor: 'bg-yellow-400/15' },
  testing: { label: 'Testing', color: 'text-green-400', bgColor: 'bg-green-400/15' },
  devops: { label: 'DevOps', color: 'text-red-400', bgColor: 'bg-red-400/15' },
  docs: { label: 'Docs', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
  config: { label: 'Config', color: 'text-purple-400', bgColor: 'bg-purple-400/15' },
  general: { label: 'General', color: 'text-ghost-text-dim', bgColor: 'bg-white/5' },
}
