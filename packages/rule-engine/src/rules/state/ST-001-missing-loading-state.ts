import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const ST_001_RULE: CraftLensRule = {
  id: 'ST-001',
  category: 'ux',
  title: 'Missing Loading State',
  problemTitle: 'Missing loading state for async data',
  description: 'Component performs asynchronous data fetching but provides no loading indicator, skeleton, or feedback while waiting.',
  rationale: 'Async network requests take non-zero time. Without a loading state, users experience a frozen or blank interface and are unsure if their request is processing.',
  whatIsWrong: 'Asynchronous data fetching is executed without a loading indicator or skeleton.',
  whyItMatters: 'Users cannot tell whether the interface is frozen, failed, or retrieving information.',
  howToFix: 'Track loading status (e.g. isLoading state) and render a skeleton screen or subtle spinner during pending requests.',
  severity: 'medium' as any,
  confidence: 0.85,
  engine: 'regex',
  recommendation: 'Provide explicit loading skeletons or spinners during asynchronous operations.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['state-coverage', 'loading', 'ux'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const source = context.sourceCode;

    // Check if component performs fetch/axios or useEffect data load
    const hasAsyncFetch =
      source.includes('fetch(') ||
      source.includes('axios.') ||
      source.includes('useQuery(') ||
      source.includes('useSWR(');

    if (!hasAsyncFetch) return [];

    // Check if loading state is tracked or rendered
    const hasLoadingHandling =
      source.includes('isLoading') ||
      source.includes('loading') ||
      source.includes('Skeleton') ||
      source.includes('Spinner') ||
      source.includes('Suspense') ||
      source.includes('pending');

    if (!hasLoadingHandling) {
      const match = /(?:fetch|axios\.[a-z]+)\s*\(/.exec(source);
      const line = match ? source.substring(0, match.index).split('\n').length : 1;
      const location = createLocation(context.filePath, line, 1, 0, line, 1, 0);

      findings.push({
        ruleId: 'ST-001',
        problemTitle: 'Missing loading state for async data',
        message: 'Component fetches data over network without rendering loading feedback.',
        whatIsWrong: 'Network data request is executed without a loading skeleton or indicator.',
        whyItMatters: 'Creates layout shift and visual freezing during data acquisition.',
        howToFix: 'Introduce an isLoading state variable and display a skeleton screen while awaiting data.',
        severity: 'medium' as any,
        confidence: 0.85,
        location,
        findingType: 'problem',
        evidence: [
          regexEvidence('Network fetch detected without corresponding loading/skeleton state', location),
          {
            type: 'rule',
            explanation: 'Async fetch operation without loading UI feedback',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  },
};
