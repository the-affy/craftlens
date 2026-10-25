import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const SEC_003_RULE: CraftLensRule = {
  id: 'SEC-003',
  category: 'security',
  title: 'Dangerous HTML Injection (XSS)',
  problemTitle: 'Unsanitized HTML injection risk',
  description: 'dangerouslySetInnerHTML used without sanitization (e.g. DOMPurify), opening a direct Cross-Site Scripting (XSS) attack vector.',
  rationale: 'Injecting raw HTML into the DOM bypasses React HTML escaping and allows injected scripts to execute within the victim browser.',
  whatIsWrong: 'dangerouslySetInnerHTML is used to inject raw markup without sanitization.',
  whyItMatters: 'Enables cross-site scripting (XSS), allowing attackers to steal session cookies, inject keystroke loggers, or manipulate user state.',
  howToFix: 'Sanitize content using DOMPurify.sanitize(content) before passing to dangerouslySetInnerHTML, or render plain text children.',
  severity: 'error',
  confidence: 0.95,
  engine: 'regex',
  recommendation: 'Sanitize HTML with DOMPurify before dangerouslySetInnerHTML.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['security', 'frontend-security', 'xss'],
  supportedActions: ['explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const source = context.sourceCode;
    const dangerousRegex = /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*([^}]+)\s*\}\s*\}/g;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = dangerousRegex.exec(lineText)) !== null) {
        // If sanitized with DOMPurify or custom sanitizer, it is safe
        const varName = match[1].trim();
        if (
          lineText.includes('DOMPurify.sanitize') ||
          lineText.includes('sanitizeHtml') ||
          varName.toLowerCase().includes('clean') ||
          varName.toLowerCase().includes('sanitized') ||
          source.includes(`sanitizeHtmlString`) ||
          source.includes(`DOMPurify.sanitize`)
        ) {
          continue;
        }

        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'SEC-003',
          problemTitle: 'Unsanitized HTML injection risk',
          message: 'dangerouslySetInnerHTML used without DOMPurify sanitization.',
          whatIsWrong: 'Raw HTML is injected into the DOM without sanitization.',
          whyItMatters: 'Permits Cross-Site Scripting (XSS) if any part of the HTML originates from user input, URL params, or API payloads.',
          howToFix: 'Wrap raw HTML in DOMPurify.sanitize(...) before injection.',
          severity: 'error',
          confidence: 0.95,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Unsanitized innerHTML assignment: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'dangerouslySetInnerHTML without DOMPurify validation',
            },
          ],
          supportedActions: ['explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
