import { Finding, Severity } from '../types/index.js';

export function calculateAggregateConfidence(findings: Finding[]): number {
  if (findings.length === 0) return 0;
  // Weighted combined confidence: 1 - product(1 - c_i)
  const complementProduct = findings.reduce((acc, f) => acc * (1 - Math.min(Math.max(f.confidence, 0), 0.99)), 1);
  return Number((1 - complementProduct).toFixed(2));
}

export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
