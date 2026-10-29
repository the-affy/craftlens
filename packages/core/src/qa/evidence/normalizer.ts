import * as path from 'node:path';
import * as fs from 'node:fs';
import { QAEvidence, QARawFinding } from '../types.js';

export interface NormalizedFindingResult {
  accepted: boolean;
  finding?: QARawFinding;
  discardReason?: string;
}

export class EvidenceNormalizer {
  /**
   * Normalizes, validates, and fingerprints a raw QA finding.
   * Discards findings that lack real evidence or are completely speculative.
   */
  public normalize(raw: QARawFinding, workspaceRoot: string): NormalizedFindingResult {
    // 1. Evidence check: must have at least one piece of concrete evidence
    if (!raw.evidence || raw.evidence.length === 0) {
      // If code snippet or valid file/line exists, construct evidence
      if (raw.filePath && raw.startLine) {
        raw.evidence = [
          {
            type: 'ast_pattern',
            description: raw.message || raw.title,
            source: raw.sourceAnalyzer || 'craftlens-qa',
            filePath: raw.filePath,
            line: raw.startLine,
          },
        ];
      } else {
        return {
          accepted: false,
          discardReason: 'No concrete evidence provided for finding (Evidence First requirement)',
        };
      }
    }

    // 2. Validate file existence if path provided
    let normalizedPath = raw.filePath;
    if (workspaceRoot && normalizedPath) {
      const fullPath = path.isAbsolute(normalizedPath)
        ? normalizedPath
        : path.resolve(workspaceRoot, normalizedPath);
      
      // Keep relative path for consistent fingerprinting across platforms
      if (path.isAbsolute(normalizedPath)) {
        normalizedPath = path.relative(workspaceRoot, fullPath);
      }
      normalizedPath = normalizedPath.split(path.sep).join('/');
    }

    // 3. Normalize Confidence
    let confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.70;
    confidence = Math.max(0.0, Math.min(1.0, confidence));

    // If confidence is speculative (< 0.40) and evidence is weak, discard
    if (confidence < 0.40 && raw.evidence.length <= 1) {
      return {
        accepted: false,
        discardReason: `Confidence score (${confidence.toFixed(2)}) is speculative with insufficient evidence`,
      };
    }

    // 4. Distinguish Evidence, Inference, Recommendation
    const inference =
      raw.inference ||
      raw.message ||
      'Potential security or quality risk based on static/runtime pattern.';
    const recommendation =
      raw.recommendation ||
      'Inspect the highlighted code and address the finding according to project standards.';

    // 5. Generate stable fingerprint
    const lineKey = raw.startLine ? `L${raw.startLine}` : 'L0';
    const fingerprint =
      raw.fingerprint ||
      `qa:${raw.ruleId}:${normalizedPath}:${lineKey}`;

    const normalizedFinding: QARawFinding = {
      ...raw,
      id: raw.id || `cl-qa-${raw.ruleId.toLowerCase()}-${Math.abs(this.hashString(fingerprint))}`,
      filePath: normalizedPath,
      confidence,
      inference,
      recommendation,
      fingerprint,
      evidence: raw.evidence.map(e => ({
        ...e,
        filePath: e.filePath ? (path.isAbsolute(e.filePath) && workspaceRoot ? path.relative(workspaceRoot, e.filePath).split(path.sep).join('/') : e.filePath) : normalizedPath,
      })),
    };

    return {
      accepted: true,
      finding: normalizedFinding,
    };
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

