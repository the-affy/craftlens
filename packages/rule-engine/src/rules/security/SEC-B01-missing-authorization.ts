import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const SEC_B01_RULE: CraftLensRule = {
  id: 'SEC-B01',
  category: 'security',
  title: 'Missing Authorization / IDOR Risk',
  problemTitle: 'Missing authorization check on sensitive operation',
  description: 'Backend handler modifies or deletes resources by ID directly from request params without verifying ownership or authorization permissions.',
  rationale: 'Insecure Direct Object Reference (IDOR) occurs when an application provides direct access to objects based on user-supplied input without an authorization check.',
  whatIsWrong: 'API handler modifies database record using req.params.id without verifying caller owns the resource.',
  whyItMatters: 'Any authenticated user can tamper with, view, or delete other tenants records simply by changing the ID in the request.',
  howToFix: 'Ensure every query includes user/tenant isolation (e.g. WHERE id = ? AND userId = session.userId) or an authorization guard.',
  severity: 'error',
  confidence: 0.88,
  engine: 'regex',
  recommendation: 'Verify tenant/user ownership in database query or middleware guard.',
  fix: 'manual',
  platforms: ['node', 'typescript', 'javascript'],
  tags: ['security', 'backend-security', 'idor', 'authorization'],
  supportedActions: ['explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const source = context.sourceCode;

    // Detect Express / Next.js API delete or update by param id without auth check
    const idorRegex = /(?:router|app)\.(?:delete|put|patch)\s*\(\s*['"][^'"]*:[a-zA-Z0-9_]+['"]/g;
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = idorRegex.exec(lineText)) !== null) {
        // Look ahead for auth middleware
        const hasAuth = lineText.includes('requireAuth') || lineText.includes('authenticate') || lineText.includes('isAuthenticated') || lineText.includes('verifyToken');
        if (hasAuth) continue;

        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'SEC-B01',
          problemTitle: 'Missing authorization check on route',
          message: 'Sensitive mutation endpoint lacks authentication/authorization guard middleware.',
          whatIsWrong: 'State-modifying API route does not enforce authentication or ownership authorization.',
          whyItMatters: 'Allows unauthenticated or cross-tenant callers to modify or delete resources by supplying arbitrary IDs.',
          howToFix: 'Add authentication middleware and scope queries to the authenticated user ID.',
          severity: 'error',
          confidence: 0.88,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Unprotected mutation route: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Route handler parameters bound directly to resource mutation without auth guard',
            },
          ],
          supportedActions: ['explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
