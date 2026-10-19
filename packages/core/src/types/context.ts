export type DetectionEngine =
  | 'ast'
  | 'type'
  | 'css'
  | 'dom'
  | 'visual'
  | 'graph'
  | 'runtime'
  | 'network'
  | 'semantic'
  | 'cluster';

export type Platform =
  | 'web'
  | 'react'
  | 'typescript'
  | 'javascript'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'node';

export type RuleCategory =
  | 'code'
  | 'patchwork'
  | 'functionality'
  | 'accessibility'
  | 'css'
  | 'placeholder'
  | 'architecture'
  | 'truth'
  | 'visual'
  | 'copy'
  | 'security';

export interface ProjectBaseline {
  radius: number[];
  spacing: number[];
  colors: string[];
  naming: string[];
  utilities: string[];
}

export interface ProjectContext {
  rootPath: string;
  framework?: string;
  language: 'typescript' | 'javascript';
  packageManager?: string;
  dependencies: Record<string, string>;
  sourceDirectories: string[];
  componentDirectories: string[];
  hasTypeScript: boolean;
  cssStrategy?: 'tailwind' | 'css-modules' | 'vanilla' | 'styled-components';
  baseline: ProjectBaseline;
}

export interface AnalysisContext {
  filePath: string;
  sourceCode: string;
  parsedAst?: unknown;
  projectContext: ProjectContext;
  options?: Record<string, unknown>;
}
