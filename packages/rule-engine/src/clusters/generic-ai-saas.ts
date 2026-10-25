import { Finding, RuleCluster, calculateAggregateConfidence } from '@craftlens/core';

export const AS_001_CLUSTER: RuleCluster = {
  id: 'AS-001',
  name: 'Generic AI SaaS Pattern Cluster',
  description:
    'Detects an uncalibrated composite of generic template patterns (centered hero, dual CTA, feature card triplets, badge capsules, and placeholder marketing copy) indicating template patchwork.',
  rules: [
    'UI-001-centered-hero',
    'UI-002-dual-cta',
    'UI-003-generic-feature-cards',
    'UI-004-ai-capsule',
    'CP-005-generic-marketing-copy',
  ],
  minSignals: 3,
  calculateConfidence(findings: Finding[]): number {
    const matchingRules = findings.filter(f => this.rules.includes(f.ruleId));
    if (matchingRules.length < this.minSignals) return 0;
    return calculateAggregateConfidence(matchingRules);
  },
  createFinding(findings: Finding[]): Finding | null {
    const matching = findings.filter(f => this.rules.includes(f.ruleId));
    if (matching.length < this.minSignals) {
      return null;
    }

    const confidence = this.calculateConfidence(matching);
    const primaryLocation = matching[0].location;

    return {
      ruleId: this.id,
      message: `Multiple generic template patterns detected (${matching.length} co-occurring signals).`,
      description:
        'This page structure combines several generic boilerplate design patterns (such as centered hero, dual CTA, and feature card triplets) into a template-driven composition without project-specific design cohesion.',
      severity: 'suggestion',
      confidence,
      location: primaryLocation,
      evidence: matching.flatMap(m => m.evidence),
      recommendation:
        'Differentiate the page layout and CTA structure to reflect the specific domain workflow rather than generic SaaS layout templates.',
      relatedFindings: matching.map(m => m.ruleId),
      clusterId: this.id,
    };
  },
};
