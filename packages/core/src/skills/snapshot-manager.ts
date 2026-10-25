import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuditSnapshot, AuditDiff } from '../types/snapshot.js';
import { Finding } from '../types/finding.js';
import { SkillPackage } from '../types/skill.js';
import { Rule } from '../types/rule.js';
import { computeContentHash } from './hasher.js';

export class AuditSnapshotManager {
  private baseDir: string;
  public static readonly ENGINE_VERSION = '1.0.0';

  constructor(workspaceRoot: string) {
    this.baseDir = path.join(workspaceRoot, '.craftlens', 'snapshots');
  }

  public ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public createSnapshot(options: {
    skills: SkillPackage[];
    rules: Rule[];
    findings: Finding[];
    projectSourceText?: string;
  }): AuditSnapshot {
    this.ensureDir();
    const timestamp = new Date().toISOString();
    const id = `snapshot_${Date.now()}`;
    const projectHash = computeContentHash(
      options.projectSourceText || options.findings.map(f => f.fingerprint || f.ruleId).join(':')
    );

    const skills = options.skills.map(s => s.version);
    const rules = options.rules.map(r => ({
      id: r.id,
      version: r.version || '1.0.0',
    }));

    const errorCount = options.findings.filter(f => f.severity === 'error' || f.severity === 'blocker').length;
    const warningCount = options.findings.filter(f => f.severity === 'warning').length;
    const suggestionCount = options.findings.filter(f => f.severity === 'suggestion' || f.severity === 'info').length;

    const snapshot: AuditSnapshot = {
      id,
      timestamp,
      engineVersion: AuditSnapshotManager.ENGINE_VERSION,
      skills,
      rules,
      findings: options.findings,
      projectHash,
      summary: {
        totalFindings: options.findings.length,
        errorCount,
        warningCount,
        suggestionCount,
      },
    };

    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`Failed to write audit snapshot to ${filePath}:`, err);
    }

    return snapshot;
  }

  public getSnapshot(id: string): AuditSnapshot | null {
    const filePath = path.join(this.baseDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  public listSnapshots(): { id: string; timestamp: string; totalFindings: number }[] {
    if (!fs.existsSync(this.baseDir)) return [];
    const files = fs.readdirSync(this.baseDir).filter(f => f.endsWith('.json'));
    const list: { id: string; timestamp: string; totalFindings: number }[] = [];

    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.baseDir, f), 'utf-8'));
        list.push({
          id: data.id,
          timestamp: data.timestamp,
          totalFindings: data.summary?.totalFindings ?? data.findings?.length ?? 0,
        });
      } catch {}
    }

    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  public compareSnapshots(oldSnapshot: AuditSnapshot, newSnapshot: AuditSnapshot): AuditDiff {
    const oldFingerprints = new Map(oldSnapshot.findings.map(f => [f.fingerprint || f.id || `${f.ruleId}:${f.location.start.line}`, f]));
    const newFingerprints = new Map(newSnapshot.findings.map(f => [f.fingerprint || f.id || `${f.ruleId}:${f.location.start.line}`, f]));

    const resolvedFindings: Finding[] = [];
    const unresolvedFindings: Finding[] = [];
    const newFindings: Finding[] = [];

    for (const [key, oldF] of oldFingerprints.entries()) {
      if (!newFingerprints.has(key)) {
        resolvedFindings.push(oldF);
      } else {
        unresolvedFindings.push(oldF);
      }
    }

    for (const [key, newF] of newFingerprints.entries()) {
      if (!oldFingerprints.has(key)) {
        newFindings.push(newF);
      }
    }

    const netImprovement = resolvedFindings.length - newFindings.length;

    return {
      previousSnapshotId: oldSnapshot.id,
      currentSnapshotId: newSnapshot.id,
      resolvedFindings,
      newFindings,
      unresolvedFindings,
      netImprovement,
      previousCount: oldSnapshot.findings.length,
      currentCount: newSnapshot.findings.length,
    };
  }
}
