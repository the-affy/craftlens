import { ProjectContext } from '../types/context.js';

export interface RecommendedSkill {
  id: string;
  name: string;
  description: string;
  reason: string;
  relevanceScore: number;
  category: 'frontend' | 'backend' | 'design' | 'security' | 'quality';
  enabledByDefault?: boolean;
}

/**
 * Inspects actual project characteristics and recommends tailored skills (Section 12).
 * Does NOT recommend every skill to every project.
 */
export function recommendSkillsForProject(context: ProjectContext): RecommendedSkill[] {
  const recommendations: RecommendedSkill[] = [];
  const frameworkLower = (context.framework || '').toLowerCase();
  const cssStrategyLower = (context.cssStrategy || '').toLowerCase();
  const deps = context.dependencies || {};

  const isFrontend =
    frameworkLower.includes('next') ||
    frameworkLower.includes('react') ||
    frameworkLower.includes('vue') ||
    frameworkLower.includes('svelte') ||
    frameworkLower.includes('angular') ||
    frameworkLower.includes('astro') ||
    frameworkLower.includes('remix');

  const isBackend =
    frameworkLower.includes('nest') ||
    frameworkLower.includes('fastify') ||
    frameworkLower.includes('express') ||
    frameworkLower.includes('hono') ||
    deps['pg'] ||
    deps['mysql2'] ||
    deps['prisma'] ||
    deps['@prisma/client'] ||
    deps['drizzle-orm'] ||
    deps['typeorm'] ||
    deps['mongoose'];

  const hasComponents = (context.designSystem?.components?.length || 0) > 0;
  const hasDesignTokens = (context.designTokens?.colors?.length || 0) > 0 || (context.cssStrategy && cssStrategyLower !== 'none');
  const isDesignHeavy = hasDesignTokens || context.productMeta?.productType === 'marketing' || context.productMeta?.productType === 'brand';

  // 1. Frontend Projects (React / Next.js / Vue / Svelte)
  if (isFrontend || hasComponents) {
    recommendations.push({
      id: 'ui-ux-quality',
      name: 'UI/UX Quality',
      description: 'Audits visual hierarchy, consistency, component reuse, and interaction feedback.',
      reason: hasComponents
        ? `Based on ${context.designSystem?.components?.length || 'discovered'} detected frontend components.`
        : 'Based on detected frontend framework and interactive views.',
      relevanceScore: 0.95,
      category: 'frontend',
      enabledByDefault: true,
    });

    recommendations.push({
      id: 'accessibility',
      name: 'Accessibility',
      description: 'Checks ARIA attributes, button naming, keyboard focus, and contrast.',
      reason: 'Interactive elements and component views detected.',
      relevanceScore: 0.90,
      category: 'frontend',
      enabledByDefault: true,
    });

    recommendations.push({
      id: 'frontend-code-quality',
      name: 'Frontend Code Quality',
      description: 'Identifies oversized components, duplicate styling, and unhandled loading/error states.',
      reason: hasComponents
        ? 'Component tree and interactive state flows detected.'
        : 'Frontend application structure detected.',
      relevanceScore: 0.85,
      category: 'quality',
    });
  }

  // 2. Design-heavy frontends
  if (isDesignHeavy) {
    recommendations.push({
      id: 'design-systems',
      name: 'Design Systems',
      description: 'Enforces token compliance, consistent spacing scales, and radius harmony.',
      reason: context.cssStrategy === 'tailwind'
        ? 'Tailwind CSS architecture and design token tokens detected.'
        : 'Design token system and brand guidelines detected.',
      relevanceScore: 0.92,
      category: 'design',
    });

    recommendations.push({
      id: 'responsive-design',
      name: 'Responsive Design',
      description: 'Detects arbitrary fixed widths, missing responsive breakpoints, and overflow risks.',
      reason: 'Multi-screen responsive surfaces detected in UI layer.',
      relevanceScore: 0.82,
      category: 'design',
    });

    recommendations.push({
      id: 'visual-consistency',
      name: 'Visual Consistency',
      description: 'Finds clashing corner radiuses, random color values, and inconsistent spacing.',
      reason: 'Project has shared visual surfaces requiring unified brand appearance.',
      relevanceScore: 0.88,
      category: 'design',
    });
  }

  // 3. Backend & API Code
  if (isBackend) {
    recommendations.push({
      id: 'api-design',
      name: 'API Design',
      description: 'Evaluates REST/RPC conventions, status codes, request validation, and payload shapes.',
      reason: 'Server endpoints, routing, and backend handlers detected.',
      relevanceScore: 0.94,
      category: 'backend',
      enabledByDefault: true,
    });

    recommendations.push({
      id: 'error-handling',
      name: 'Error Handling',
      description: 'Detects unhandled promise rejections, swallowed exceptions, and missing fallbacks.',
      reason: 'Backend business logic and database interactions detected.',
      relevanceScore: 0.91,
      category: 'quality',
    });

    recommendations.push({
      id: 'dependency-safety',
      name: 'Dependency Safety',
      description: 'Audits dependency security, deprecated APIs, and supply-chain configurations.',
      reason: 'Server-side runtime dependencies and ecosystem packages detected.',
      relevanceScore: 0.85,
      category: 'security',
    });
  }

  // 4. Security (Recommended whenever auth/security/sensitive calls detected)
  const hasAuthOrNet = context.securityConfig?.hasAuth || deps['axios'] || deps['node-fetch'] || deps['jsonwebtoken'];
  if (hasAuthOrNet || isBackend) {
    recommendations.push({
      id: 'security-review',
      name: 'Security Review',
      description: 'Detects hardcoded secrets, unsafe deserialization, injection risks, and missing auth.',
      reason: context.securityConfig?.hasAuth
        ? 'Authentication code and security packages detected.'
        : 'External network and data handling logic detected.',
      relevanceScore: 0.89,
      category: 'security',
      enabledByDefault: true,
    });
  }

  // Sort by relevance score descending
  return recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
