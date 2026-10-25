import { SourceLocation } from './location.js';
import { Evidence } from './evidence.js';
import { Severity } from './severity.js';

export type UIElementType =
  | 'card'
  | 'button'
  | 'input'
  | 'heading'
  | 'text'
  | 'image'
  | 'badge'
  | 'icon'
  | 'container'
  | 'navigation'
  | 'table'
  | 'chart'
  | 'dialog'
  | 'hero'
  | 'metric'
  | 'section'
  | 'unknown';

export interface UIElementStyles {
  background?: string;
  color?: string;
  border?: string;
  radius?: number;
  shadow?: string;
  padding?: string;
  gap?: string;
  gradient?: string;
  backdropBlur?: string;
  fontSize?: string;
  fontWeight?: string;
  display?: string;
  textAlign?: string;
  flexDirection?: string;
  width?: string;
  maxWidth?: string;
  height?: string;
  overflow?: string;
  animation?: string;
  opacity?: string;
}

export interface UIElement {
  id: string;
  type: UIElementType;
  file?: string;
  range?: SourceLocation;
  parent?: UIElement;
  parentId?: string;
  children: UIElement[];
  tagName: string;
  classes: string[];
  styles?: UIElementStyles;
  attributes: Record<string, string>;
  content?: string;
  role?: string;
  depth: number;
  visualTreatmentScore?: number;
}

export interface LayoutFingerprint {
  id: string;
  name: string;
  elements: string[];
  sequence: string[];
  confidence: number;
  description: string;
}

export interface PatternSignal {
  ruleId: string;
  name: string;
  weight: number;
  evidence: Evidence[];
}

export interface PatternCluster {
  id: string;
  title: string;
  signals: PatternSignal[];
  confidence: number;
  severity: Severity;
  score: number;
  rationale: string;
}

export interface UIDebugSummary {
  projectDetected?: string;
  frameworkDetected?: string;
  uiFilesDiscovered?: number;
  componentsDiscovered?: number;
  stylesDiscovered?: number;
  tokensDiscovered?: number;
  routesDiscovered?: string[];
  domAvailable?: boolean;
  renderedUiAvailable?: boolean;
  filesScanned: number;
  uiFiles: number;
  components: number;
  rulesExecuted: number;
  rulesSkipped: number;
  rawSignalsList?: string[];
  patternsBuilt?: string[];
  signalsDetected: {
    cards: number;
    buttons: number;
    badges: number;
    gradients: number;
    glows: number;
    largeRadii: number;
    shadows: number;
    repeatedComponents: number;
    sparkles: number;
    fakeMetrics: number;
  };
  clusters: Record<string, number>;
  findings: {
    high: number;
    medium: number;
    suggestions: number;
  };
  suppressedFindings?: { ruleId: string; reason: string }[];
}
