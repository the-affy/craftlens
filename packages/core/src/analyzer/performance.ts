export interface PerformanceMetrics {
  filePath: string;
  parseTimeMs: number;
  ruleExecutionTimeMs: number;
  totalDiagnosticTimeMs: number;
  cacheHit: boolean;
  ruleTimings: Record<string, number>;
  timestamp: number;
}

export class PerformanceTracker {
  private metricsLog: PerformanceMetrics[] = [];
  private maxLogs: number = 100;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  public recordMetric(metric: PerformanceMetrics): void {
    if (metric.cacheHit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
    this.metricsLog.push(metric);
    if (this.metricsLog.length > this.maxLogs) {
      this.metricsLog.shift();
    }
  }

  public getStats() {
    const totalRuns = this.metricsLog.length;
    const avgTotalTime = totalRuns > 0
      ? this.metricsLog.reduce((acc, m) => acc + m.totalDiagnosticTimeMs, 0) / totalRuns
      : 0;
    const avgParseTime = totalRuns > 0
      ? this.metricsLog.reduce((acc, m) => acc + m.parseTimeMs, 0) / totalRuns
      : 0;
    const avgRuleTime = totalRuns > 0
      ? this.metricsLog.reduce((acc, m) => acc + m.ruleExecutionTimeMs, 0) / totalRuns
      : 0;

    return {
      totalRuns,
      avgTotalTimeMs: Number(avgTotalTime.toFixed(2)),
      avgParseTimeMs: Number(avgParseTime.toFixed(2)),
      avgRuleTimeMs: Number(avgRuleTime.toFixed(2)),
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRatio: totalRuns > 0 ? Number((this.cacheHits / (this.cacheHits + this.cacheMisses)).toFixed(2)) : 0,
    };
  }

  public getRecentLogs(): readonly PerformanceMetrics[] {
    return this.metricsLog;
  }

  public clear(): void {
    this.metricsLog = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}
