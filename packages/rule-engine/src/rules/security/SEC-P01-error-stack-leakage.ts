import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const SEC_P01_RULE: CraftLensRule = {
  id: 'SEC-P01',
  category: 'security',
  title: 'Error Stack Trace Leakage',
  problemTitle: 'Internal stack trace leaked in response',
  description: 'Raw error stack trace (err.stack) or database error details returned in HTTP responses to client callers.',
  rationale: 'Sending raw stack traces leaks server directory structure, library versions, database table schemas, and internal line numbers to potential attackers.',
  whatIsWrong: 'err.stack or raw internal exception is sent directly in the HTTP response.',
  whyItMatters: 'Discloses sensitive server paths, internal architecture, and dependency versions that aid targeted exploits.',
  howToFix: 'Log the full stack trace securely on the server and return a sanitized, user-friendly error message to the client.',
  severity: 'error',
  confidence: 0.95,
  engine: 'regex',
  recommendation: 'Log stack traces internally and send sanitized error messages to clients.',
  fix: 'manual',
  platforms: ['node', 'typescript', 'javascript'],
  tags: ['security', 'practical-security', 'information-disclosure'],
  supportedActions: ['explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const leakRegex = /res\.(?:status\(\d+\)\.)?(?:json|send)\s*\(\s*(?:\{[^}]*stack\s*:\s*[a-zA-Z0-9_]+\.stack|err\.stack)/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = leakRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'SEC-P01',
          problemTitle: 'Internal stack trace leaked in response',
          message: 'Error stack trace returned directly in client response.',
          whatIsWrong: 'Raw stack trace is exposed to client callers.',
          whyItMatters: 'Leaking stack traces reveals file paths, module versions, and internal infrastructure to attackers.',
          howToFix: 'Log error stack on the server and return { message: "Internal server error" } with a reference ID.',
          severity: 'error',
          confidence: 0.95,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Stack trace leakage: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'res.json() / res.send() includes err.stack',
            },
          ],
          supportedActions: ['explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
