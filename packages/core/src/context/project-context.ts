import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ProjectDesignBaseline,
  ProjectDesignSystem,
  ProjectContext,
  ProductMeta,
  DiscoveredComponent,
} from '../types/index.js';

export function createDefaultBaseline(): ProjectDesignBaseline {
  return {
    radius: [4, 8, 12, 16],
    spacing: [4, 8, 12, 16, 24, 32, 48, 64],
    colors: ['#0f172a', '#3b82f6', '#10b981', '#ef4444', '#f59e0b'],
    typography: {
      primaryFont: 'Inter',
      weights: [400, 500, 600, 700],
    },
    components: ['Button', 'Input', 'Modal', 'Card', 'Table'],
    naming: ['PascalCase', 'camelCase'],
    utilities: ['cn', 'clsx'],
  };
}

export function createDefaultDesignSystem(): ProjectDesignSystem {
  return {
    hasDesignSystem: false,
    colors: {
      palette: ['#0f172a', '#3b82f6', '#10b981', '#ef4444', '#f59e0b'],
      semantic: {
        primary: '#3b82f6',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        background: '#ffffff',
        surface: '#f8fafc',
      },
      cssVariables: [],
    },
    typography: {
      fontFamilies: ['Inter', 'system-ui', 'sans-serif'],
      fontWeights: [400, 500, 600, 700],
      fontSizes: ['12px', '14px', '16px', '18px', '20px', '24px', '32px'],
    },
    spacing: [4, 8, 12, 16, 24, 32, 48, 64],
    radius: [4, 8, 12, 16],
    shadows: ['sm', 'md', 'lg', 'xl'],
    components: [],
    icons: [],
    motion: {
      durations: ['150ms', '200ms', '300ms'],
      easings: ['ease', 'ease-in-out', 'cubic-bezier(0.4, 0, 0.2, 1)'],
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
  };
}

export function createDefaultProductMeta(): ProductMeta {
  return {
    productType: 'application',
    expectedDensity: 'normal',
    hasProductDoc: false,
    hasDesignDoc: false,
    assumptions: ['Defaulting to application/product interface intent'],
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
    componentDirectories: ['components', 'src/components', 'ui', 'src/components/ui'],
    routes: [],
    hasTypeScript: true,
    cssStrategy: undefined,
    baseline: createDefaultBaseline(),
    designSystem: createDefaultDesignSystem(),
    productMeta: createDefaultProductMeta(),
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
  const root = input.rootPath || '/';
  let pkgJson = input.packageJson;

  // Auto-load package.json from disk if not explicitly passed
  if (!pkgJson && root && root !== '/') {
    try {
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      }
    } catch {
      // Safe fallback
    }
  }

  const dependencies: Record<string, string> = {
    ...(pkgJson?.dependencies || {}),
    ...(pkgJson?.devDependencies || {}),
  };

  let framework: string | undefined;
  if (dependencies['next']) framework = 'nextjs';
  else if (dependencies['@remix-run/react']) framework = 'remix';
  else if (dependencies['astro']) framework = 'astro';
  else if (dependencies['react']) framework = 'react';
  else if (dependencies['vue']) framework = 'vue';
  else if (dependencies['@angular/core']) framework = 'angular';
  else if (dependencies['svelte']) framework = 'svelte';
  else if (dependencies['@nestjs/core']) framework = 'nestjs';
  else if (dependencies['fastify']) framework = 'fastify';
  else if (dependencies['express']) framework = 'express';
  else if (dependencies['hono']) framework = 'hono';

  let cssStrategy: 'tailwind' | 'css-modules' | 'vanilla' | 'styled-components' | undefined;
  if (dependencies['tailwindcss']) cssStrategy = 'tailwind';
  else if (dependencies['styled-components'] || dependencies['@emotion/react']) cssStrategy = 'styled-components';
  else if (input.fileList && input.fileList.some(f => f.endsWith('.module.css') || f.endsWith('.module.scss'))) cssStrategy = 'css-modules';
  else if (input.fileList && input.fileList.some(f => f.endsWith('.css'))) cssStrategy = 'vanilla';

  let componentSystem: string | undefined;
  if (dependencies['@shadcn/ui'] || (dependencies['@radix-ui/react-slot'] && dependencies['class-variance-authority'])) {
    componentSystem = 'shadcn/ui';
  } else if (Object.keys(dependencies).some(k => k.startsWith('@radix-ui/'))) {
    componentSystem = 'Radix UI';
  } else if (dependencies['@mui/material']) {
    componentSystem = 'Material UI (MUI)';
  } else if (dependencies['@chakra-ui/react']) {
    componentSystem = 'Chakra UI';
  } else if (dependencies['antd']) {
    componentSystem = 'Ant Design';
  } else if (dependencies['@mantine/core']) {
    componentSystem = 'Mantine';
  }

  let packageManager = pkgJson?.packageManager;
  if (!packageManager && input.fileList) {
    if (input.fileList.some(f => f.includes('pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (input.fileList.some(f => f.includes('yarn.lock'))) packageManager = 'yarn';
    else if (input.fileList.some(f => f.includes('package-lock.json'))) packageManager = 'npm';
    else if (input.fileList.some(f => f.includes('bun.lockb') || f.includes('bun.lock'))) packageManager = 'bun';
  }

  const hasTypeScript = input.hasTsConfig ?? (!!dependencies['typescript'] || (input.fileList ? input.fileList.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) : true));

  const designSystem = createDefaultDesignSystem();
  if (dependencies['tailwindcss'] || (input.fileList && input.fileList.some(f => f.includes('tailwind.config')))) {
    designSystem.hasDesignSystem = true;
    designSystem.source = 'tailwind';
  }

  // Detect icons
  const iconPackages = ['lucide-react', '@radix-ui/react-icons', 'react-icons', '@heroicons/react', 'tabler-icons-react'];
  for (const pkg of iconPackages) {
    if (dependencies[pkg]) {
      designSystem.icons.push(pkg);
    }
  }

  // Tooling configurations
  const lintConfig = {
    hasEslint: !!dependencies['eslint'] || (input.fileList ? input.fileList.some(f => f.includes('.eslintrc') || f.includes('eslint.config')) : false),
    hasBiome: !!dependencies['@biomejs/biome'] || (input.fileList ? input.fileList.some(f => f.includes('biome.json')) : false),
    hasPrettier: !!dependencies['prettier'] || (input.fileList ? input.fileList.some(f => f.includes('.prettierrc') || f.includes('prettier.config')) : false),
    configs: [] as string[],
  };

  const accessibilityTooling = {
    hasAxe: !!dependencies['axe-core'] || !!dependencies['@axe-core/react'],
    hasJsxA11y: !!dependencies['eslint-plugin-jsx-a11y'],
    hasTestingLibrary: Object.keys(dependencies).some(d => d.includes('@testing-library')),
  };

  let testingFramework = 'none';
  if (dependencies['vitest']) testingFramework = 'vitest';
  else if (dependencies['jest']) testingFramework = 'jest';
  else if (dependencies['@playwright/test']) testingFramework = 'playwright';
  else if (dependencies['cypress']) testingFramework = 'cypress';
  else if (dependencies['mocha']) testingFramework = 'mocha';
  const testingSetup = { framework: testingFramework };

  const securityPackages = ['helmet', 'cors', 'csurf', 'next-auth', '@auth/core', '@supabase/supabase-js', 'jsonwebtoken', 'bcrypt', 'argon2'];
  const detectedSecurityPkgs = securityPackages.filter(p => dependencies[p]);
  const securityConfig = {
    hasHelmet: !!dependencies['helmet'],
    hasCors: !!dependencies['cors'],
    hasAuth: detectedSecurityPkgs.some(p => p.includes('auth') || p.includes('token') || p.includes('supabase')),
    packages: detectedSecurityPkgs,
  };

  // Discover existing components and routes from fileList or disk
  const discoveredComponents: DiscoveredComponent[] = [];
  const baselineComponents = new Set<string>(['Button', 'Input', 'Modal', 'Card', 'Table']);
  const routes: string[] = [];

  // If no fileList provided, scan common component directories on disk
  let candidateFiles = input.fileList || [];
  if (candidateFiles.length === 0 && root && root !== '/') {
    const commonScanDirs = ['src', 'app', 'components', 'ui', 'pages'];
    for (const sub of commonScanDirs) {
      const fullDir = path.join(root, sub);
      if (fs.existsSync(fullDir)) {
        try {
          const readRec = (d: string, depth = 0): string[] => {
            if (depth > 4) return [];
            const results: string[] = [];
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const e of entries) {
              if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
              const p = path.join(d, e.name);
              if (e.isDirectory()) results.push(...readRec(p, depth + 1));
              else results.push(p);
            }
            return results;
          };
          candidateFiles.push(...readRec(fullDir));
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  for (const file of candidateFiles) {
    const match = file.match(/[\/\\](?:components|ui|common)[\/\\]([A-Z][a-zA-Z0-9_-]+)\.(?:tsx|jsx|ts|js)$/);
    if (match) {
      const compName = match[1];
      let category: DiscoveredComponent['category'] = 'other';
      const lower = compName.toLowerCase();
      if (lower.includes('button') || lower.includes('btn')) category = 'button';
      else if (lower.includes('modal') || lower.includes('dialog')) category = 'modal';
      else if (lower.includes('card')) category = 'card';
      else if (lower.includes('input') || lower.includes('field')) category = 'input';
      else if (lower.includes('table')) category = 'table';

      discoveredComponents.push({
        name: compName,
        filePath: file,
        category,
        exports: [compName],
      });
      baselineComponents.add(compName);
    }

    // Check routes
    if (file.match(/[\/\\](?:routes|pages|app)[\/\\]/i) && (file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.js'))) {
      routes.push(file);
    }
  }

  if (discoveredComponents.length > 0 && !componentSystem) {
    componentSystem = 'custom';
  }

  designSystem.components = discoveredComponents;
  const baseline = createDefaultBaseline();
  baseline.components = Array.from(baselineComponents);

  // ─────────────────────────────────────────────────────────────
  // Design Tokens Extraction & Learned Conventions (Section 4 & 20)
  // ─────────────────────────────────────────────────────────────
  const designTokens: {
    colors: Array<{ name: string; value: string; variable: string; category?: 'color' }>;
    radius: Array<{ name: string; value: string; variable: string; category?: 'radius' }>;
    spacing: Array<{ name: string; value: string; variable: string; category?: 'spacing' }>;
    typography: Array<{ name: string; value: string; variable: string; category?: 'typography' }>;
    shadows: Array<{ name: string; value: string; variable: string; category?: 'shadow' }>;
  } = {
    colors: [],
    radius: [],
    spacing: [],
    typography: [],
    shadows: [],
  };

  const learnedColorMap: Record<string, string> = {
    '#6b7280': '--color-text-muted',
    '#9ca3af': '--color-text-muted',
    '#3b82f6': '--color-primary',
    '#10b981': '--color-success',
    '#ef4444': '--color-danger',
    '#f59e0b': '--color-warning',
  };

  const preferredComponents: Record<string, string> = {};
  for (const comp of discoveredComponents) {
    if (comp.category === 'button') preferredComponents['button'] = comp.name;
    if (comp.category === 'card') preferredComponents['card'] = comp.name;
    if (comp.category === 'modal') preferredComponents['modal'] = comp.name;
    if (comp.category === 'input') preferredComponents['input'] = comp.name;
  }

  // Scan CSS files for custom properties
  const cssFiles = candidateFiles.filter(f => f.endsWith('.css') || f.endsWith('.scss') || f.endsWith('.tokens.json'));
  for (const cssFile of cssFiles.slice(0, 20)) {
    try {
      if (fs.existsSync(cssFile)) {
        const content = fs.readFileSync(cssFile, 'utf-8');
        // Match CSS variables: --name: value;
        const varMatches = content.matchAll(/--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g);
        for (const m of varMatches) {
          const varName = `--${m[1]}`;
          const val = m[2].trim();
          designSystem.colors.cssVariables.push(varName);

          if (/#[0-9a-fA-F]{3,8}|rgba?\(|hsl\(/.test(val)) {
            designTokens.colors.push({ name: m[1], value: val, variable: varName, category: 'color' });
            if (val.startsWith('#')) {
              learnedColorMap[val.toLowerCase()] = varName;
            }
          } else if (/radius|rounded/i.test(m[1]) || /px|rem|em/.test(val)) {
            if (/radius|rounded/i.test(m[1])) {
              designTokens.radius.push({ name: m[1], value: val, variable: varName, category: 'radius' });
            } else if (/space|spacing|gap|pad|margin/i.test(m[1])) {
              designTokens.spacing.push({ name: m[1], value: val, variable: varName, category: 'spacing' });
            }
          }
        }
      }
    } catch {
      // Safe fallback
    }
  }

  // Add default design tokens if none parsed from files
  if (designTokens.colors.length === 0) {
    designTokens.colors = [
      { name: 'color-text-muted', value: '#6B7280', variable: '--color-text-muted', category: 'color' },
      { name: 'color-primary', value: '#3B82F6', variable: '--color-primary', category: 'color' },
      { name: 'color-success', value: '#10B981', variable: '--color-success', category: 'color' },
      { name: 'color-danger', value: '#EF4444', variable: '--color-danger', category: 'color' },
      { name: 'color-warning', value: '#F59E0B', variable: '--color-warning', category: 'color' },
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // Product Context Reasoning (PRODUCT.md / DESIGN.md / README)
  // ─────────────────────────────────────────────────────────────
  const productMeta: ProductMeta = createDefaultProductMeta();
  if (root && root !== '/') {
    try {
      const productPath = [
        path.join(root, 'PRODUCT.md'),
        path.join(root, 'docs', 'PRODUCT.md'),
        path.join(root, '.planning', 'PRODUCT.md'),
      ].find(p => fs.existsSync(p));

      if (productPath) {
        productMeta.hasProductDoc = true;
        const productContent = fs.readFileSync(productPath, 'utf-8');
        const lower = productContent.toLowerCase();

        if (lower.includes('landing') || lower.includes('marketing') || lower.includes('brand') || lower.includes('showcase')) {
          productMeta.productType = 'marketing';
          productMeta.expectedDensity = 'spacious';
        } else if (lower.includes('dashboard') || lower.includes('analytics') || lower.includes('admin') || lower.includes('ops')) {
          productMeta.productType = 'dashboard';
          productMeta.expectedDensity = 'compact';
        } else {
          productMeta.productType = 'application';
        }

        const audienceMatch = productContent.match(/(?:audience|users|for)\s*:\s*([^\n\r]+)/i);
        if (audienceMatch) productMeta.audience = audienceMatch[1].trim();

        const taskMatch = productContent.match(/(?:main task|primary job|purpose)\s*:\s*([^\n\r]+)/i);
        if (taskMatch) productMeta.primaryTask = taskMatch[1].trim();
      }

      const designPath = [
        path.join(root, 'DESIGN.md'),
        path.join(root, 'docs', 'DESIGN.md'),
        path.join(root, '.planning', 'DESIGN.md'),
      ].find(p => fs.existsSync(p));

      if (designPath) {
        productMeta.hasDesignDoc = true;
        designSystem.hasDesignSystem = true;
        const designContent = fs.readFileSync(designPath, 'utf-8');
        const lower = designContent.toLowerCase();

        // Extract intentional brand colors
        const hexMatches = designContent.match(/#(?:[0-9a-fA-F]{3,8})\b/g);
        if (hexMatches && hexMatches.length > 0) {
          productMeta.brandColors = Array.from(new Set(hexMatches));
          baseline.brandColors = productMeta.brandColors;
          designSystem.colors.palette = Array.from(new Set([...designSystem.colors.palette, ...hexMatches]));
          for (const hex of hexMatches) {
            learnedColorMap[hex.toLowerCase()] = `--color-brand-${hex.substring(1, 4)}`;
          }
        }

        // Extract intentional patterns
        const intentional: string[] = [];
        if (lower.includes('cards') || lower.includes('card container')) intentional.push('cards');
        if (lower.includes('inter')) intentional.push('Inter font');
        if (lower.includes('gradient')) intentional.push('gradients');
        if (lower.includes('glass') || lower.includes('backdrop-blur')) intentional.push('glass');
        if (lower.includes('dense') || lower.includes('compact')) intentional.push('dense-layout');
        productMeta.intentionalPatterns = intentional;
      }
    } catch {
      // Safe fallback
    }
  }

  return {
    rootPath: root,
    framework,
    language: hasTypeScript ? 'typescript' : 'javascript',
    packageManager,
    dependencies,
    sourceDirectories: ['src', 'app', 'pages'],
    componentDirectories: ['components', 'src/components', 'ui', 'src/components/ui'],
    routes,
    hasTypeScript,
    cssStrategy,
    componentSystem,
    lintConfig,
    accessibilityTooling,
    testingSetup,
    securityConfig,
    namingConventions: {
      components: 'PascalCase',
      functions: 'camelCase',
      files: 'kebab-case',
    },
    designTokens,
    learnedConventions: {
      colorMap: learnedColorMap,
      preferredComponents,
      preferredRadius: '8px',
    },
    baseline,
    designSystem,
    productMeta,
  };
}


