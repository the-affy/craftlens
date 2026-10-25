import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const ST_003_RULE: CraftLensRule = {
  id: 'ST-003',
  category: 'ux',
  title: 'Missing Error State',
  problemTitle: 'Missing error state for failed request',
  description: 'Component triggers network requests or form submissions without handling the failure/error branch in the user interface.',
  rationale: 'Network failures and API errors are inevitable. Failing silently or leaving users stuck on an indefinite loading screen when a request fails damages user trust and prevents recovery.',
  whatIsWrong: 'Asynchronous operation has no error handling or error message presentation in UI.',
  whyItMatters: 'When requests fail, users are left with no explanation, no retry option, and no way to recover.',
  howToFix: 'Catch errors, set an error state, and render an accessible inline alert with a retry action.',
  severity: 'warning',
  confidence: 0.86,
  engine: 'regex',
  recommendation: 'Provide explicit error handling and user recovery paths for failed requests.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['state-coverage', 'error-state', 'resilience', 'ux'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const source = context.sourceCode;

    const hasAsyncOperation =
      source.includes('fetch(') ||
      source.includes('axios.') ||
      source.includes('async ') ||
      source.includes('.then(');

    if (!hasAsyncOperation) return [];

    const hasErrorHandling =
      source.includes('catch') ||
      source.includes('isError') ||
      source.includes('error') ||
      source.includes('ErrorBoundary');

    if (!hasErrorHandling) {
      const match = /(?:fetch|axios\.[a-z]+|async)\b/.exec(source);
      const line = match ? source.substring(0, match.index).split('\n').length : 1;
      const location = createLocation(context.filePath, line, 1, 0, line, 1, 0);

      findings.push({
        ruleId: 'ST-003',
        problemTitle: 'Missing error state for failed request',
        message: 'Asynchronous operation lacks error state handling in UI.',
        whatIsWrong: 'Network request or async action has no catch block or error UI branch.',
        whyItMatters: 'If the network or server fails, the interface fails silently or locks up indefinitely.',
        howToFix: 'Wrap in try/catch or handle error state to display a clear error message with a retry button.',
        severity: 'warning',
        confidence: 0.86,
        location,
        findingType: 'problem',
        evidence: [
          regexEvidence('Async operation without catch block or UI error state', location),
          {
            type: 'rule',
            explanation: 'Uncaught async network call without failure state fallback',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  },
};
