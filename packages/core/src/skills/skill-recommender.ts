import { ProjectContext } from '../types/context.js';
import { Issue } from '../types/issue.js';
import { Finding } from '../types/finding.js';

export enum SkillPriority {
  ExplicitUserProjectRules = 1,
  ProjectDesignSystem = 2,
  UserSelectedSkills = 3,
  BuiltinCraftLensRules = 4,
  GenericDesignIntelligence = 5,
}

export interface RecommendedSkill {
  id: string;
  name: string;
  description: string;
  reason: string;
  relevanceScore: number;
  category: 'frontend' | 'backend' | 'design' | 'security' | 'quality';
  enabledByDefault?: boolean;
  relatedFindingCount?: number;
  installCommand?: string;
}

/**
 * Inspects actual project characteristics and recommends tailored skills (Section 12).
 * Incorporates findings from the Issue Registry to explain WHY each skill is relevant.
 */
export function recommendSkillsForProject(
  context: ProjectContext,
  issues?: (Issue | Finding)[]
): RecommendedSkill[] {
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
    Boolean(deps['pg']) ||
    Boolean(deps['mysql2']) ||
    Boolean(deps['prisma']) ||
    Boolean(deps['@prisma/client']) ||
    Boolean(deps['drizzle-orm']) ||
    Boolean(deps['typeorm']) ||
    Boolean(deps['mongoose']);

  const hasComponents = (context.designSystem?.components?.length || 0) > 0;
  const hasDesignTokens =
    (context.designTokens?.colors?.length || 0) > 0 ||
    (context.cssStrategy && cssStrategyLower !== 'none');
  const isDesignHeavy =
    hasDesignTokens ||
    context.productMeta?.productType === 'marketing' ||
    context.productMeta?.productType === 'brand' ||
    (isFrontend && (cssStrategyLower.includes('css') || cssStrategyLower.includes('tailwind')));

  // Count active issues by cluster if provided
  let designSystemCount = 0;
  let securityCount = 0;
  let performanceCount = 0;
  let accessibilityCount = 0;
  let codeQualityCount = 0;

  if (Array.isArray(issues) && issues.length > 0) {
    for (const item of issues) {
      const rid = (item.ruleId || '').toUpperCase();
      const cat = (item.category || '').toLowerCase();

      if (rid.startsWith('SEC-') || cat === 'security') securityCount++;
      else if (rid.startsWith('AX-') || cat === 'accessibility') accessibilityCount++;
      else if (rid === 'CSS-005' || rid === 'UI-022' || cat === 'performance') performanceCount++;
      else if (
        rid.startsWith('CX-') ||
        rid.startsWith('CP-') ||
        rid.startsWith('VH-') ||
        rid.startsWith('CL-') ||
        rid.startsWith('ID-') ||
        cat === 'ui' ||
        cat === 'ui-ux'
      )
        designSystemCount++;
      else codeQualityCount++;
    }
  }

  // 1. Frontend Projects (React / Next.js / Vue / Svelte)
  if (isFrontend || hasComponents) {
    let uiReason = hasComponents
      ? `Based on ${context.designSystem?.components?.length || 'discovered'} detected frontend components.`
      : 'Based on detected frontend framework and interactive views.';
    if (designSystemCount > 0) {
      uiReason = `${designSystemCount} finding${designSystemCount === 1 ? '' : 's'} appear related to inconsistent button, spacing, typography, or color implementations. This skill can improve contextual UI analysis.`;
    }

    recommendations.push({
      id: 'ui-ux-quality',
      name: 'UI/UX Quality',
      description: 'Audits visual hierarchy, consistency, component reuse, and interaction feedback.',
      reason: uiReason,
      relevanceScore: designSystemCount > 0 ? 0.98 : 0.95,
      category: 'frontend',
      enabledByDefault: true,
      relatedFindingCount: designSystemCount,
      installCommand: 'craftlens.installSkill',
    });

    let a11yReason = 'Interactive elements and component views detected.';
    if (accessibilityCount > 0) {
      a11yReason = `${accessibilityCount} finding${accessibilityCount === 1 ? '' : 's'} indicate missing ARIA landmarks, unlabelled buttons, or contrast issues.`;
    }

    recommendations.push({
      id: 'accessibility',
      name: 'Accessibility',
      description: 'Checks ARIA attributes, button naming, keyboard focus, and contrast.',
      reason: a11yReason,
      relevanceScore: accessibilityCount > 0 ? 0.96 : 0.90,
      category: 'frontend',
      enabledByDefault: true,
      relatedFindingCount: accessibilityCount,
      installCommand: 'craftlens.installSkill',
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
      installCommand: 'craftlens.installSkill',
    });
  }

  // 2. Design-heavy frontends
  if (isDesignHeavy) {
    let dsReason = context.cssStrategy === 'tailwind' || cssStrategyLower.includes('tailwind')
      ? 'Tailwind CSS architecture and design token tokens detected.'
      : 'Design token system and brand guidelines detected.';
    if (designSystemCount > 0) {
      dsReason = `${designSystemCount} finding${designSystemCount === 1 ? '' : 's'} appear related to inconsistent button, spacing, typography, and color implementations. This skill can improve contextual UI analysis.`;
    }

    recommendations.push({
      id: 'design-systems',
      name: 'Design Systems',
      description: 'Enforces token compliance, consistent spacing scales, and radius harmony.',
      reason: dsReason,
      relevanceScore: 0.92,
      category: 'design',
      relatedFindingCount: designSystemCount,
      installCommand: 'craftlens.installSkill',
    });

    recommendations.push({
      id: 'responsive-design',
      name: 'Responsive Design',
      description: 'Detects arbitrary fixed widths, missing responsive breakpoints, and overflow risks.',
      reason: 'Multi-screen responsive surfaces detected in UI layer.',
      relevanceScore: 0.82,
      category: 'design',
      installCommand: 'craftlens.installSkill',
    });

    recommendations.push({
      id: 'visual-consistency',
      name: 'Visual Consistency',
      description: 'Finds clashing corner radiuses, random color values, and inconsistent spacing.',
      reason: 'Project has shared visual surfaces requiring unified brand appearance.',
      relevanceScore: 0.88,
      category: 'design',
      installCommand: 'craftlens.installSkill',
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
      installCommand: 'craftlens.installSkill',
    });

    let errReason = 'Backend business logic and database interactions detected.';
    if (codeQualityCount > 0) {
      errReason = `${codeQualityCount} finding${codeQualityCount === 1 ? '' : 's'} indicate silent failure modes, exception swallowing, or unhandled async rejections.`;
    }

    recommendations.push({
      id: 'error-handling',
      name: 'Error Handling',
      description: 'Detects unhandled promise rejections, swallowed exceptions, and missing fallbacks.',
      reason: errReason,
      relevanceScore: 0.91,
      category: 'quality',
      relatedFindingCount: codeQualityCount,
      installCommand: 'craftlens.installSkill',
    });

    recommendations.push({
      id: 'dependency-safety',
      name: 'Dependency Safety',
      description: 'Audits dependency security, deprecated APIs, and supply-chain configurations.',
      reason: 'Server-side runtime dependencies and ecosystem packages detected.',
      relevanceScore: 0.85,
      category: 'security',
      installCommand: 'craftlens.installSkill',
    });
  }

  // 4. Security
  const hasAuthOrNet = Boolean(
    context.securityConfig?.hasAuth ||
    deps['axios'] ||
    deps['node-fetch'] ||
    deps['jsonwebtoken']
  );
  if (hasAuthOrNet || isBackend || securityCount > 0) {
    let secReason = context.securityConfig?.hasAuth
      ? 'Authentication code and security packages detected.'
      : 'External network and data handling logic detected.';
    if (securityCount > 0) {
      secReason = `${securityCount} finding${securityCount === 1 ? '' : 's'} ${securityCount === 1 ? 'indicates' : 'indicate'} sensitive data exposure, lack of authorization, or dangerous DOM operations.`;
    }

    recommendations.push({
      id: 'security-review',
      name: 'Security Review',
      description: 'Detects hardcoded secrets, unsafe deserialization, injection risks, and missing auth.',
      reason: secReason,
      relevanceScore: securityCount > 0 ? 0.99 : 0.89,
      category: 'security',
      enabledByDefault: true,
      relatedFindingCount: securityCount,
      installCommand: 'craftlens.installSkill',
    });
  }

  // Sort by relevance score descending
  return recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
