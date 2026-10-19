import { ProjectBaseline, ProjectContext } from '../types/index.js';

export function createDefaultBaseline(): ProjectBaseline {
  return {
    radius: [4, 8, 12, 16],
    spacing: [4, 8, 12, 16, 24, 32],
    colors: [],
    naming: ['PascalCase', 'camelCase'],
    utilities: ['cn', 'clsx'],
  };
}

export function createDefaultProjectContext(rootPath: string = '/'): ProjectContext {
  return {
    rootPath,
    framework: undefined,
    language: 'typescript',
    packageManager: undefined,
    dependencies: {},
    sourceDirectories: ['src', 'app'],
    componentDirectories: ['components', 'ui'],
    hasTypeScript: true,
    cssStrategy: undefined,
    baseline: createDefaultBaseline(),
  };
}

export interface ProjectContextDetectorInput {
  rootPath: string;
  packageJson?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    packageManager?: string;
  };
  hasTsConfig?: boolean;
  fileList?: string[];
}

export function detectProjectContext(input: ProjectContextDetectorInput): ProjectContext {
  const dependencies: Record<string, string> = {
    ...(input.packageJson?.dependencies || {}),
    ...(input.packageJson?.devDependencies || {}),
  };

  let framework: string | undefined;
  if (dependencies['next']) framework = 'nextjs';
  else if (dependencies['react']) framework = 'react';
  else if (dependencies['vue']) framework = 'vue';
  else if (dependencies['@angular/core']) framework = 'angular';
  else if (dependencies['svelte']) framework = 'svelte';

  let cssStrategy: 'tailwind' | 'css-modules' | 'vanilla' | 'styled-components' | undefined;
  if (dependencies['tailwindcss']) cssStrategy = 'tailwind';
  else if (dependencies['styled-components']) cssStrategy = 'styled-components';

  let packageManager = input.packageJson?.packageManager;
  if (!packageManager && input.fileList) {
    if (input.fileList.some(f => f.includes('pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (input.fileList.some(f => f.includes('yarn.lock'))) packageManager = 'yarn';
    else if (input.fileList.some(f => f.includes('package-lock.json'))) packageManager = 'npm';
    else if (input.fileList.some(f => f.includes('bun.lockb') || f.includes('bun.lock'))) packageManager = 'bun';
  }

  const hasTypeScript = input.hasTsConfig ?? (!!dependencies['typescript'] || (input.fileList ? input.fileList.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) : true));

  return {
    rootPath: input.rootPath,
    framework,
    language: hasTypeScript ? 'typescript' : 'javascript',
    packageManager,
    dependencies,
    sourceDirectories: ['src', 'app', 'pages'],
    componentDirectories: ['components', 'src/components', 'ui'],
    hasTypeScript,
    cssStrategy,
    baseline: createDefaultBaseline(),
  };
}
