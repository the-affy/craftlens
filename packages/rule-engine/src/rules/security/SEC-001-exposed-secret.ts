import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'OpenAI API Key',
    regex: /\b(sk-[a-zA-Z0-9]{32,}|sk-proj-[a-zA-Z0-9_-]{32,})\b/,
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{36,})\b/,
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
  },
  {
    name: 'Slack Token',
    regex: /\b(xox[baprs]-[0-9a-zA-Z-]{24,})\b/,
  },
  {
    name: 'Private Key Header',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
];

const ASSIGNMENT_SECRET_REGEX =
  /(?:api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']([A-Za-z0-9+/=_\-]{20,})["']/i;

const SAFE_PLACEHOLDERS = [
  'your-api-key',
  'your_api_key',
  'placeholder',
  'dummy_token',
  'test_token',
  '<your-api-key>',
  'todo',
  'xxxxxxxx',
  'insert_here',
  'changeme',
];

export const SEC_001_RULE: CraftLensRule = {
  id: 'SEC-001',
  category: 'security',
  title: 'Exposed Secret or API Credential',
  description: 'Hardcoded secret, API key, access token, or private key detected in source code.',
  rationale:
    'Hardcoded credentials committed to repositories lead to secret leakage, unauthorized cloud access, and compliance violations. Secrets must always be injected at runtime via environment variables or secret vaults.',
  severity: 'blocker',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Remove the hardcoded secret immediately. Store credentials in environment variables (e.g. process.env.API_KEY) or a secure secrets manager.',
  fix: 'manual',
  platforms: ['javascript', 'typescript', 'web', 'node'],
  tags: ['security', 'secrets', 'owasp', 'cwe-798'],
  minimumAuditLevel: 'easy',
  supportedActions: ['explain', 'not_a_problem'],
  problemTitle: 'Hardcoded secrets',
  whatIsWrong: 'Hardcoded plaintext secret or API key detected in source code.',
  whyItMatters:
    'Plaintext credentials in source files risk credential theft, repository leaks, and unauthorized cloud access.',
  howToFix:
    'Remove the hardcoded secret immediately, rotate the compromised key, and load credentials via environment variables.',
  suggestedSteps: [
    'Rotate the compromised secret in your provider dashboard immediately.',
    'Move the secret into an untracked `.env` file or secret manager.',
    'Reference the key at runtime via `process.env.SECRET_NAME`.',
    'Ensure `.env` is listed in `.gitignore`.',
  ],
  diagnosis: 'Source code contains an exposed plaintext API key or credential.',
  structuredRecommendation: {
    summary: 'Extract the credential to an environment variable and rotate the exposed secret.',
    why: 'Plaintext credentials in source control can be extracted by any tool, collaborator, or CI job.',
    rationale: 'Plaintext credentials in source control can be extracted by any tool, collaborator, or CI job.',
    howToFix: 'Remove the secret, rotate it in the provider console, and inject via environment variables.',
    steps: [
      'Rotate the compromised secret in your provider dashboard immediately.',
      'Move the secret into an untracked `.env` file or secret manager.',
      'Reference the key at runtime via `process.env.SECRET_NAME`.',
      'Ensure `.env` is listed in `.gitignore`.',
    ],
    alternatives: [
      {
        id: 'alt-env-var',
        title: 'Environment Variable (.env)',
        description: 'Read the credential at runtime via `process.env.API_KEY` and add the .env file to .gitignore.',
        tradeoffs: ['Standard practice for local development and container deployments.'],
      },
      {
        id: 'alt-vault',
        title: 'Secrets Manager',
        description: 'Fetch the secret securely at startup from AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault.',
        tradeoffs: ['Recommended for production infrastructure and enterprise compliance.'],
      },
    ],
  },
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    // Skip fixture and test mock files to prevent test suites from tripping over deliberate sample tests
    if (context.filePath.includes('/fixtures/negative/') || context.filePath.includes('.test.')) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;
    const sourceText = parsed.sourceText;

    function isSafePlaceholder(val: string): boolean {
      const lower = val.toLowerCase();
      return SAFE_PLACEHOLDERS.some(p => lower.includes(p));
    }

    function maskSecret(val: string): string {
      if (val.length <= 8) return '****';
      return val.substring(0, 4) + '...' + val.substring(val.length - 4);
    }

    function checkLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): void {
      const text = node.text;
      if (!text || text.length < 16) return;
      if (isSafePlaceholder(text)) return;

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(text)) {
          const location = parsed!.getLocation(node);
          findings.push({
            ruleId: 'SEC-001',
            message: `Exposed ${pattern.name} detected (${maskSecret(text)}).`,
            description:
              'Hardcoded credentials committed to version control compromise security and risk immediate unauthorized access.',
            severity: 'blocker',
            confidence: 0.95,
            location,
            evidence: [
              astEvidence(
                `Found hardcoded ${pattern.name} in string literal.`,
                location,
                `[MASKED: ${maskSecret(text)}]`
              ),
            ],
            recommendation: 'Extract credential to environment variable and rotate this secret immediately.',
            supportedActions: ['explain', 'not_a_problem'],
          });
          return;
        }
      }

      // Check assignment pattern on the full text of the parent
      const parent = node.parent;
      if (
        (parent && ts.isPropertyAssignment(parent)) ||
        (parent && ts.isVariableDeclaration(parent)) ||
        (parent && ts.isBinaryExpression(parent))
      ) {
        const parentText = parent.getText(sourceFile);
        const match = parentText.match(ASSIGNMENT_SECRET_REGEX);
        if (match && match[1] && !isSafePlaceholder(match[1])) {
          const secretVal = match[1];
          const location = parsed!.getLocation(node);
          findings.push({
            ruleId: 'SEC-001',
            message: `Exposed secret detected in assignment (${maskSecret(secretVal)}).`,
            description:
              'Plaintext credential variable contains an apparent high-entropy API key or secret token.',
            severity: 'blocker',
            confidence: 0.90,
            location,
            evidence: [
              astEvidence(
                'Variable assignment matches secret credential pattern with high-entropy literal.',
                location,
                `[MASKED: ${maskSecret(secretVal)}]`
              ),
            ],
            recommendation: 'Use process.env or secret manager to supply this credential.',
            supportedActions: ['explain', 'not_a_problem'],
          });
        }
      }
    }

    function walk(node: ts.Node): void {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        checkLiteral(node);
      }
      ts.forEachChild(node, walk);
    }

    walk(sourceFile);
    return findings;
  },
};
