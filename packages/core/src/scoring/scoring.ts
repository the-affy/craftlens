import { Finding } from '../types/finding.js';

export function calculateAggregateConfidence(findings: Finding[]): number {
  if (findings.length === 0) return 0;
  // Weighted combined confidence: 1 - product(1 - c_i)
  const complementProduct = findings.reduce((acc, f) => acc * (1 - Math.min(Math.max(f.confidence, 0), 0.99)), 1);
  return Number((1 - complementProduct).toFixed(2));
}

export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High';
  if (confidence >= 0.75) return 'Medium';
  return 'Low';
}

export interface HealthScoreInput {
  passedChecks: number;
  totalChecks: number;
  errors: number;
  warnings: number;
  suggestions: number;
  totalFindings?: number;
}

export interface HealthScoreResult {
  score: number;
  grade: 'Healthy' | 'Needs Attention' | 'Critical';
  status: 'Healthy' | 'Needs Attention' | 'Critical';
  breakdown: string;
  explanation: string;
}

export function calculateHealthScore(
  passedChecksOrInput: number | HealthScoreInput,
  totalChecks?: number,
  errors?: number,
  warnings?: number,
  suggestions?: number
): HealthScoreResult {
  let passed: number;
  let total: number;
  let errCount: number;
  let warnCount: number;
  let suggCount: number;

  if (typeof passedChecksOrInput === 'object') {
    passed = passedChecksOrInput.passedChecks ?? 0;
    total = passedChecksOrInput.totalChecks ?? 0;
    errCount = passedChecksOrInput.errors ?? 0;
    warnCount = passedChecksOrInput.warnings ?? 0;
    suggCount = passedChecksOrInput.suggestions ?? 0;
  } else {
    passed = passedChecksOrInput;
    total = totalChecks ?? 0;
    errCount = errors ?? 0;
    warnCount = warnings ?? 0;
    suggCount = suggestions ?? 0;
  }

  if (total === 0) {
    return {
      score: 100,
      grade: 'Healthy',
      status: 'Healthy',
      breakdown: 'No checks applicable to this project.',
      explanation: 'No checks applicable to this project.',
    };
  }

  // Base score from percentage of checklist criteria satisfied (0-100)
  const checklistRatio = passed / total;
  const baseScore = Math.round(checklistRatio * 100);

  // Deduction based on active findings
  // Errors: severe penalty (-12 per error, up to -50)
  const errorPenalty = Math.min(50, errCount * 12);
  // Warnings: moderate penalty (-1.3 per warning, up to -30)
  const warningPenalty = Math.min(30, Math.round(warnCount * 1.3));
  // Suggestions: minor penalty (-0.5 per suggestion, up to -10)
  const suggestionPenalty = Math.min(10, Math.round(suggCount * 0.5));

  const totalDeductions = errorPenalty + warningPenalty + suggestionPenalty;
  const rawScore = baseScore - totalDeductions;
  const score = Math.max(0, Math.min(100, rawScore));

  const grade: 'Healthy' | 'Needs Attention' | 'Critical' =
    errCount > 0 || score < 60
      ? 'Critical'
      : warnCount > 0 || score < 85
      ? 'Needs Attention'
      : 'Healthy';

  const breakdown =
    `Health: ${score} / 100 (${grade})\n` +
    `Based on:\n` +
    `• ${passed} / ${total} checks passed (${baseScore} base pts)\n` +
    `• ${errCount} errors (-${errorPenalty} pts)\n` +
    `• ${warnCount} warnings (-${warningPenalty} pts)\n` +
    `• ${suggCount} suggestions (-${suggestionPenalty} pts)`;

  return { score, grade, status: grade, breakdown, explanation: breakdown };
}
