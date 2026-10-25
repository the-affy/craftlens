import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const SEC_002_RULE: CraftLensRule = {
  id: 'SEC-002',
  category: 'security',
  title: 'Insecure Client Storage of Auth Tokens',
  problemTitle: 'Auth token stored in insecure localStorage',
  description: 'Authentication tokens or sensitive session credentials stored in localStorage or sessionStorage where they are vulnerable to XSS exfiltration.',
  rationale: 'localStorage has no httpOnly protection; any JavaScript running on the page (including third-party analytics or XSS payloads) can read tokens stored in it. Secure httpOnly SameSite cookies prevent token theft.',
  whatIsWrong: 'Auth token or credentials are being read or written directly to localStorage/sessionStorage.',
  whyItMatters: 'If any XSS vulnerability occurs or any third-party script is compromised, attacker scripts can exfiltrate tokens immediately.',
  howToFix: 'Store session tokens in secure, httpOnly, SameSite=Strict cookies rather than client-accessible storage.',
  severity: 'error',
  confidence: 0.94,
  engine: 'regex',
  recommendation: 'Use httpOnly cookies for session tokens instead of localStorage.',
  fix: 'manual',
  platforms: ['react', 'web', 'javascript', 'typescript'],
  tags: ['security', 'frontend-security', 'auth', 'tokens', 'xss'],
  supportedActions: ['explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const storageRegex = /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\s*\(\s*['"](?:token|authToken|access_token|jwt|id_token|secret)['"]/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = storageRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'SEC-002',
          problemTitle: 'Auth token stored in insecure localStorage',
          message: 'Sensitive auth token accessed via localStorage/sessionStorage.',
          whatIsWrong: 'Auth tokens or credentials stored in client-accessible localStorage.',
          whyItMatters: 'localStorage lacks httpOnly protection, leaving session tokens vulnerable to XSS extraction.',
          howToFix: 'Migrate session tokens to httpOnly cookies with SameSite=Lax/Strict.',
          severity: 'error',
          confidence: 0.94,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Insecure token storage pattern: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Token accessible by any client-side JavaScript execution context',
            },
          ],
          supportedActions: ['explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
