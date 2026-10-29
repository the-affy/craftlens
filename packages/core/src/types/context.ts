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
  | 'cluster'
  | 'regex'
  | 'heuristic';

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
  | 'ui-ux'
  | 'content'
  | 'code-quality'
  | 'performance'
  | 'code'
  | 'react'
  | 'patchwork'
  | 'functionality'
  | 'accessibility'
  | 'css'
  | 'placeholder'
  | 'architecture'
  | 'truth'
  | 'visual'
  | 'copy'
  | 'security'
  | 'hierarchy'
  | 'design'
  | 'ui'
  | 'ux'
  | 'interaction'
  | 'typography'
  | 'layout'
  | 'state';

export interface DiscoveredComponent {
  name: string;
  filePath: string;
  category?: 'button' | 'modal' | 'card' | 'input' | 'table' | 'dialog' | 'feedback' | 'other';
  exports: string[];
}

export interface ProjectDesignSystem {
  hasDesignSystem: boolean;
  source?: 'tailwind' | 'css-variables' | 'theme-file' | 'tokens-json' | 'inferred';
  colors: {
    palette: string[];
    semantic: Record<string, string>;
    cssVariables: string[];
  };
  typography: {
    fontFamilies: string[];
    fontWeights: number[];
    fontSizes: string[];
  };
  spacing: number[];
  radius: number[];
  shadows: string[];
  components: DiscoveredComponent[];
  icons: string[];
  motion: {
    durations: string[];
    easings: string[];
  };
  breakpoints: Record<string, string>;
}

export interface ProjectDesignBaseline {
  colors: string[];
  spacing: number[];
  radius: number[];
  typography: {
    primaryFont?: string;
    weights: number[];
  };
  components: string[];
  allowedGradients?: boolean;
  brandColors?: string[];
  naming?: string[];
  utilities?: string[];
}

export interface ProductMeta {
  productType: 'brand' | 'marketing' | 'application' | 'dashboard' | 'docs' | 'mixed';
  audience?: string;
  primaryTask?: string;
  expectedDensity: 'compact' | 'normal' | 'spacious';
  brandColors?: string[];
  hasProductDoc: boolean;
  hasDesignDoc: boolean;
  intentionalPatterns?: string[];
  allowedExceptions?: string[];
  assumptions: string[];
}

export interface DesignTokenItem {
  name: string;
  value: string;
  variable: string;
  category?: 'color' | 'radius' | 'spacing' | 'typography' | 'shadow';
}

export interface DesignTokensCollection {
  colors: DesignTokenItem[];
  radius: DesignTokenItem[];
  spacing: DesignTokenItem[];
  typography: DesignTokenItem[];
  shadows: DesignTokenItem[];
}

export interface ProjectContext {
  rootPath: string;
  projectName?: string;
  framework?: string;
  language: 'typescript' | 'javascript';
  packageManager?: string;
  dependencies: Record<string, string>;
  sourceDirectories: string[];
  componentDirectories: string[];
  routes?: string[];
  hasTypeScript: boolean;
  cssStrategy?: 'tailwind' | 'css-modules' | 'vanilla' | 'styled-components';
  componentSystem?: string;
  lintConfig?: {
    hasEslint: boolean;
    hasBiome: boolean;
    hasPrettier: boolean;
    configs: string[];
  };
  accessibilityTooling?: {
    hasAxe: boolean;
    hasJsxA11y: boolean;
    hasTestingLibrary: boolean;
  };
  testingSetup?: {
    framework: string;
    configPath?: string;
  };
  securityConfig?: {
    hasHelmet: boolean;
    hasCors: boolean;
    hasAuth: boolean;
    packages: string[];
  };
  namingConventions?: {
    components: string;
    functions: string;
    files: string;
  };
  designTokens?: DesignTokensCollection;
  learnedConventions?: {
    colorMap: Record<string, string>;
    preferredComponents: Record<string, string>;
    preferredRadius?: string;
  };
  baseline: ProjectDesignBaseline;
  designSystem?: ProjectDesignSystem;
  productMeta?: ProductMeta;
}

export interface AnalysisContext {
  filePath: string;
  sourceCode: string;
  parsedAst?: unknown;
  projectContext: ProjectContext;
  options?: Record<string, unknown>;
  uiDoc?: unknown;
}

