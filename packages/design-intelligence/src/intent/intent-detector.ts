import { DesignIntent, DesignIntentCategory } from '@craftlens/core';

export interface IntentInferenceInput {
  filePath: string;
  sourceCode: string;
  componentNames?: string[];
  configuredIntent?: DesignIntentCategory;
}

export function inferDesignIntent(input: IntentInferenceInput): DesignIntent {
  // If user explicitly configured or corrected the intent, return it
  if (input.configuredIntent) {
    return {
      category: input.configuredIntent,
      confidence: 1.0,
      source: 'configured',
      indicators: ['Configured by user'],
      description: `Intent set to ${input.configuredIntent} via project/file settings.`,
    };
  }

  const normalizedPath = input.filePath.toLowerCase().replace(/\\/g, '/');
  const code = input.sourceCode;
  const indicators: string[] = [];

  // 1. Authentication
  if (
    normalizedPath.includes('/auth') ||
    normalizedPath.includes('/login') ||
    normalizedPath.includes('/signin') ||
    normalizedPath.includes('/signup') ||
    normalizedPath.includes('/register') ||
    normalizedPath.includes('/forgot-password')
  ) {
    indicators.push(`Path matches authentication pattern: ${normalizedPath}`);
    return {
      category: 'authentication',
      confidence: 0.9,
      source: 'inferred',
      indicators,
      description: 'Authentication surface detected. Prioritize clear input focus, single primary action, and strong error messaging.',
    };
  }

  // 2. Checkout / Billing
  if (
    normalizedPath.includes('/checkout') ||
    normalizedPath.includes('/cart') ||
    normalizedPath.includes('/billing') ||
    normalizedPath.includes('/payment')
  ) {
    indicators.push(`Path matches checkout/billing pattern`);
    return {
      category: 'checkout',
      confidence: 0.92,
      source: 'inferred',
      indicators,
      description: 'Transaction / checkout flow detected. Minimize distraction, avoid competing CTAs, and ensure transparent line-item pricing.',
    };
  }

  // 3. Settings / Profile / Preferences
  if (
    normalizedPath.includes('/settings') ||
    normalizedPath.includes('/preferences') ||
    normalizedPath.includes('/profile') ||
    normalizedPath.includes('/account')
  ) {
    indicators.push(`Path matches settings/profile pattern`);
    return {
      category: 'settings',
      confidence: 0.88,
      source: 'inferred',
      indicators,
      description: 'Configuration or settings surface detected. Use clear sectioning, quiet secondary actions, and persistent feedback.',
    };
  }

  // 4. Marketing / Landing Page
  const marketingIndicators: string[] = [];
  if (
    normalizedPath.includes('/marketing') ||
    normalizedPath.includes('/landing') ||
    normalizedPath.includes('/pricing') ||
    normalizedPath.includes('/hero') ||
    normalizedPath.includes('pages/index') ||
    normalizedPath.includes('app/page.')
  ) {
    marketingIndicators.push('Marketing path detected');
  }
  if (/Hero|Pricing|Testimonial|FeatureSection|CallToAction|FAQ/i.test(code)) {
    marketingIndicators.push('Hero, Pricing, or Feature marketing components found');
  }
  if (marketingIndicators.length > 0 && !normalizedPath.includes('dashboard')) {
    return {
      category: 'marketing',
      confidence: 0.85,
      source: 'inferred',
      indicators: marketingIndicators,
      description: 'Public marketing/landing surface detected. Engaging visuals, strong value proposition, and prominent conversion CTAs are expected.',
    };
  }

  // 5. Dashboard / Monitoring / Analytics
  const dashboardIndicators: string[] = [];
  if (
    normalizedPath.includes('/dashboard') ||
    normalizedPath.includes('/overview') ||
    normalizedPath.includes('/analytics') ||
    normalizedPath.includes('/monitoring') ||
    normalizedPath.includes('/admin')
  ) {
    dashboardIndicators.push(`Path contains dashboard/admin/analytics keyword`);
  }
  if (/Chart|Metric|Stat|KPI|DataGrid|RecentActivity|Telemetry/i.test(code)) {
    dashboardIndicators.push('Metrics, KPI, Chart, or DataGrid components detected in source');
  }
  if (dashboardIndicators.length > 0) {
    return {
      category: 'dashboard',
      confidence: 0.85,
      source: 'inferred',
      indicators: dashboardIndicators,
      description: 'Operational Dashboard/Monitoring surface detected. Prioritize readability, data density, low decorative noise, and fast task scanning.',
    };
  }

  // 6. Form / Data Entry
  if (
    code.includes('<form') ||
    /onSubmit|useForm|handleSubmit|FormItem|FormField/i.test(code)
  ) {
    indicators.push('Form tags, handlers, or form state management detected');
    return {
      category: 'form',
      confidence: 0.8,
      source: 'inferred',
      indicators,
      description: 'Form / data-entry surface detected. Prioritize accessible labels, logical tab order, validation feedback, and clear submit vs cancel hierarchy.',
    };
  }

  // 7. Documentation
  if (
    normalizedPath.includes('/docs') ||
    normalizedPath.includes('/documentation') ||
    normalizedPath.includes('/guide')
  ) {
    indicators.push('Path matches documentation pattern');
    return {
      category: 'documentation',
      confidence: 0.9,
      source: 'inferred',
      indicators,
      description: 'Documentation surface detected. High typography contrast, readability, and clear hierarchy are paramount.',
    };
  }

  // Fallback: other
  return {
    category: 'other',
    confidence: 0.5,
    source: 'inferred',
    indicators: ['General application component'],
    description: 'General application component.',
  };
}
