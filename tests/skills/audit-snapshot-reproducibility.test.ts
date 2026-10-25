import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AuditSnapshotManager,
  Finding,
  SkillPackage,
  Rule,
} from '@craftlens/core';

describe('Audit Reproducibility & AuditSnapshotManager (Sections 20, 43, 45)', () => {
  const testWorkspace = path.resolve(process.cwd(), '.test-workspace');

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('Requirement 20 & 43: creates audit snapshots with engine, skill, and rule versions', () => {
    const snapshotMgr = new AuditSnapshotManager(testWorkspace);

    const skills: SkillPackage[] = [
      {
        manifest: {
          name: 'craftlens-core',
          displayName: 'Core',
          version: '1.0.0',
          description: '',
          author: '',
          license: 'MIT',
          source: { type: 'builtin', id: 'craftlens-core' },
        },
        rules: [],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'builtin', id: 'craftlens-core' },
        version: {
          skillId: 'craftlens-core',
          version: '1.0.0',
          contentHash: 'hash_core_1',
          installedAt: '2026-10-21T00:00:00Z',
          source: { type: 'builtin', id: 'craftlens-core' },
          ruleCount: 5,
        },
      },
      {
        manifest: {
          name: 'anti-ai-ui',
          displayName: 'Anti-AI UI',
          version: '1.4.0',
          description: '',
          author: 'Vanszs',
          license: 'MIT',
          source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
        },
        rules: [],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
        version: {
          skillId: 'anti-ai-ui',
          version: '1.4.0',
          contentHash: 'hash_ai_140',
          installedAt: '2026-10-21T00:00:00Z',
          source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
          ruleCount: 7,
        },
      },
    ];

    const rules: Rule[] = [
      { id: 'AP-008', version: '1.0.0', description: '', category: 'code', severity: 'warning', detect: () => [] },
      { id: 'UI-001', version: '1.4.0', description: '', category: 'ui', severity: 'warning', detect: () => [] },
    ];

    const findings: Finding[] = [
      {
        id: 'f1',
        fingerprint: 'fp_1',
        ruleId: 'AP-008',
        message: 'Swallowed error',
        severity: 'error',
        confidence: 0.95,
        location: { filePath: '/src/api.ts', start: { line: 10, column: 1 }, end: { line: 12, column: 1 } },
        evidence: [],
      },
      {
        id: 'f2',
        fingerprint: 'fp_2',
        ruleId: 'UI-001',
        message: 'Generic gradient',
        severity: 'warning',
        confidence: 0.9,
        location: { filePath: '/src/Hero.tsx', start: { line: 5, column: 1 }, end: { line: 8, column: 1 } },
        evidence: [],
      },
    ];

    const snapshot = snapshotMgr.createSnapshot({
      skills,
      rules,
      findings,
    });

    expect(snapshot.id).toBeDefined();
    expect(snapshot.engineVersion).toBe('1.0.0');
    expect(snapshot.skills.length).toBe(2);
    expect(snapshot.skills.find(s => s.skillId === 'anti-ai-ui')?.version).toBe('1.4.0');
    expect(snapshot.rules.find(r => r.id === 'UI-001')?.version).toBe('1.4.0');
    expect(snapshot.summary?.errorCount).toBe(1);
    expect(snapshot.summary?.warningCount).toBe(1);

    // Verify snapshot persists to disk and can be retrieved
    const retrieved = snapshotMgr.getSnapshot(snapshot.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(snapshot.id);
  });

  it('compares audits and reports resolved findings and net improvements', () => {
    const snapshotMgr = new AuditSnapshotManager(testWorkspace);

    const oldSnapshot = snapshotMgr.createSnapshot({
      skills: [],
      rules: [],
      findings: [
        {
          id: 'f1',
          fingerprint: 'fp_1',
          ruleId: 'AP-008',
          message: 'Error',
          severity: 'error',
          confidence: 0.9,
          location: { filePath: '/src/a.ts', start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          evidence: [],
        },
        {
          id: 'f2',
          fingerprint: 'fp_2',
          ruleId: 'AP-014',
          message: 'Any escape',
          severity: 'warning',
          confidence: 0.9,
          location: { filePath: '/src/b.ts', start: { line: 4, column: 1 }, end: { line: 5, column: 1 } },
          evidence: [],
        },
      ],
    });

    // In the new snapshot, f1 is resolved (fixed), but a new f3 issue appeared
    const newSnapshot = snapshotMgr.createSnapshot({
      skills: [],
      rules: [],
      findings: [
        {
          id: 'f2',
          fingerprint: 'fp_2',
          ruleId: 'AP-014',
          message: 'Any escape',
          severity: 'warning',
          confidence: 0.9,
          location: { filePath: '/src/b.ts', start: { line: 4, column: 1 }, end: { line: 5, column: 1 } },
          evidence: [],
        },
        {
          id: 'f3',
          fingerprint: 'fp_3',
          ruleId: 'UI-001',
          message: 'New issue',
          severity: 'suggestion',
          confidence: 0.8,
          location: { filePath: '/src/c.tsx', start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          evidence: [],
        },
      ],
    });

    const diff = snapshotMgr.compareSnapshots(oldSnapshot, newSnapshot);

    expect(diff.resolvedFindings.length).toBe(1);
    expect(diff.resolvedFindings[0].ruleId).toBe('AP-008');

    expect(diff.newFindings.length).toBe(1);
    expect(diff.newFindings[0].ruleId).toBe('UI-001');

    expect(diff.unresolvedFindings.length).toBe(1);
    expect(diff.netImprovement).toBe(0); // 1 resolved - 1 new = 0 net change
    expect(diff.previousCount).toBe(2);
    expect(diff.currentCount).toBe(2);
  });
});
