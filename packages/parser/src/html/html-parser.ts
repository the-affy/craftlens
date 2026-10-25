import { UIElement, UIElementType, UIElementStyles, createLocation } from '@craftlens/core';

interface TokenTag {
  tagName: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attributes: Record<string, string>;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  startIndex: number;
  endIndex: number;
}

export class HtmlParser {
  private static readonly VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  /**
   * Parses HTML source into a list of root UIElements with full parent-child hierarchy.
   */
  public static parse(filePath: string, sourceText: string): { roots: UIElement[]; all: UIElement[] } {
    const tokens = HtmlParser.tokenize(sourceText);
    const roots: UIElement[] = [];
    const all: UIElement[] = [];
    const stack: { element: UIElement; token: TokenTag }[] = [];
    let idCounter = 1;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.isClosing) {
        // Pop matching open tag from stack
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].element.tagName.toLowerCase() === token.tagName.toLowerCase()) {
            const popped = stack[s];
            popped.element.range = createLocation(
              filePath,
              popped.token.line,
              popped.token.col,
              popped.token.startIndex,
              token.endLine,
              token.endCol,
              token.endIndex
            );
            stack.splice(s);
            break;
          }
        }
        continue;
      }

      // Opening or self-closing tag
      const rawClasses = token.attributes['class'] || token.attributes['className'] || '';
      const classes = rawClasses.split(/\s+/).filter(Boolean);
      const rawStyle = token.attributes['style'] || '';
      const styles = HtmlParser.parseStyles(rawStyle, classes);
      const depth = stack.length;

      const element: UIElement = {
        id: `el_${idCounter++}_${token.tagName}`,
        type: 'unknown',
        file: filePath,
        tagName: token.tagName,
        classes,
        styles,
        attributes: token.attributes,
        children: [],
        depth,
        range: createLocation(
          filePath,
          token.line,
          token.col,
          token.startIndex,
          token.endLine,
          token.endCol,
          token.endIndex
        ),
      };

      // Set content if text follows immediately before next tag
      const nextToken = tokens[i + 1];
      const textEnd = nextToken ? nextToken.startIndex : sourceText.length;
      const textBetween = sourceText.slice(token.endIndex, textEnd).trim();
      if (textBetween) {
        element.content = textBetween.replace(/<[^>]+>/g, '').trim();
      }

      // Classify element type
      element.type = HtmlParser.classifyType(element);
      element.visualTreatmentScore = HtmlParser.calculateVisualTreatmentScore(element);

      if (stack.length > 0) {
        const parentItem = stack[stack.length - 1];
        element.parent = parentItem.element;
        element.parentId = parentItem.element.id;
        parentItem.element.children.push(element);
      } else {
        roots.push(element);
      }

      all.push(element);

      const isVoid = HtmlParser.VOID_ELEMENTS.has(token.tagName.toLowerCase());
      if (!token.isSelfClosing && !isVoid) {
        stack.push({ element, token });
      }
    }

    return { roots, all };
  }

  private static tokenize(source: string): TokenTag[] {
    const tokens: TokenTag[] = [];
    const tagRegex = /<\/?([a-zA-Z0-9_-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
    const lines = source.split('\n');

    // Precompute line offsets
    const lineOffsets: number[] = [0];
    for (let l = 0; l < lines.length; l++) {
      lineOffsets.push(lineOffsets[l] + lines[l].length + 1);
    }

    const getLineCol = (index: number): { line: number; col: number } => {
      let low = 0;
      let high = lineOffsets.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (lineOffsets[mid] <= index) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      const line = Math.max(1, high + 1);
      const col = index - lineOffsets[line - 1] + 1;
      return { line, col };
    };

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(source)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      const rawAttrs = match[2] || '';
      const isSelfClosing = match[3] === '/' || fullTag.endsWith('/>');
      const isClosing = fullTag.startsWith('</');
      const startIndex = match.index;
      const endIndex = startIndex + fullTag.length;
      const startLoc = getLineCol(startIndex);
      const endLoc = getLineCol(endIndex);

      const attributes: Record<string, string> = {};
      const attrRegex = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        attributes[attrName] = attrVal;
      }

      tokens.push({
        tagName,
        isClosing,
        isSelfClosing,
        attributes,
        line: startLoc.line,
        col: startLoc.col,
        endLine: endLoc.line,
        endCol: endLoc.col,
        startIndex,
        endIndex,
      });
    }

    return tokens;
  }

  public static parseStyles(styleAttr: string, classes: string[]): UIElementStyles {
    const styles: UIElementStyles = {};

    // 1. Inline CSS & JSX styles
    if (styleAttr) {
      const cleanAttr = styleAttr.replace(/^\{|\}$/g, '').trim();
      const declarations = cleanAttr.split(/;|,/);
      for (const decl of declarations) {
        const parts = decl.split(':');
        if (parts.length >= 2) {
          const rawProp = parts[0].trim().replace(/['"]/g, '');
          const prop = rawProp.replace(/([A-Z])/g, '-$1').toLowerCase();
          const val = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
          if (prop === 'background' || prop === 'background-color') styles.background = val;
          if (prop === 'background-image' || (prop === 'background' && val.includes('gradient'))) styles.gradient = val;
          if (prop === 'color') styles.color = val;
          if (prop.startsWith('border')) styles.border = val;
          if (prop === 'border-radius') {
            styles.radius = parseInt(val, 10) || 8;
          }
          if (prop === 'box-shadow' || prop === 'filter') {
            styles.shadow = val;
            if (val.includes('blur(') || val.includes('drop-shadow(')) styles.backdropBlur = val;
          }
          if (prop.startsWith('padding')) styles.padding = val;
          if (prop === 'gap') styles.gap = val;
          if (prop === 'font-size') styles.fontSize = val;
          if (prop === 'font-weight') styles.fontWeight = val;
          if (prop === 'display') styles.display = val;
          if (prop === 'text-align') styles.textAlign = val;
          if (prop === 'flex-direction') styles.flexDirection = val;
          if (prop === 'width') styles.width = val;
          if (prop === 'max-width') styles.maxWidth = val;
          if (prop === 'height') styles.height = val;
          if (prop === 'overflow' || prop === 'overflow-x' || prop === 'overflow-y') styles.overflow = val;
          if (prop === 'animation' || prop === 'transition') styles.animation = val;
          if (prop === 'opacity') styles.opacity = val;
        }
      }
    }

    // 2. Tailwind utility classes
    const classStr = classes.join(' ');
    for (const cls of classes) {
      if (cls.startsWith('bg-gradient-') || cls.includes('gradient')) {
        styles.gradient = cls;
      }
      if (cls.startsWith('from-') || cls.startsWith('to-') || cls.startsWith('via-')) {
        styles.gradient = styles.gradient ? `${styles.gradient} ${cls}` : cls;
      }
      if (cls.startsWith('bg-')) {
        styles.background = cls;
      }
      if (cls.startsWith('text-')) {
        if (['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'].includes(cls)) {
          styles.fontSize = cls;
        } else {
          styles.color = cls;
        }
      }
      if (cls.startsWith('font-')) {
        styles.fontWeight = cls;
      }
      if (cls.startsWith('border')) {
        styles.border = cls;
      }
      if (cls.startsWith('rounded')) {
        if (cls === 'rounded-full') styles.radius = 9999;
        else if (cls === 'rounded-3xl') styles.radius = 24;
        else if (cls === 'rounded-2xl') styles.radius = 16;
        else if (cls === 'rounded-xl') styles.radius = 12;
        else if (cls === 'rounded-lg') styles.radius = 8;
        else if (cls === 'rounded-md') styles.radius = 6;
        else if (cls === 'rounded-sm') styles.radius = 4;
        else if (cls === 'rounded') styles.radius = 4;
        else if (cls.startsWith('rounded-[')) {
          const match = cls.match(/rounded-\[(\d+)px\]/);
          styles.radius = match ? parseInt(match[1], 10) : 16;
        }
      }
      if (cls.startsWith('shadow')) {
        styles.shadow = cls;
      }
      if (cls.startsWith('blur-') || cls.includes('backdrop-blur')) {
        styles.backdropBlur = cls;
      }
      if (cls.startsWith('p-') || cls.startsWith('px-') || cls.startsWith('py-')) {
        styles.padding = cls;
      }
      if (cls.startsWith('gap-')) {
        styles.gap = cls;
      }
      if (cls.startsWith('w-') || cls.startsWith('w-[')) {
        styles.width = cls;
      }
      if (cls.startsWith('max-w-')) {
        styles.maxWidth = cls;
      }
      if (cls.startsWith('h-')) {
        styles.height = cls;
      }
      if (cls.startsWith('animate-') || cls.startsWith('transition-')) {
        styles.animation = cls;
      }
      if (cls.startsWith('opacity-')) {
        styles.opacity = cls;
      }
    }

    return styles;
  }

  public static classifyType(element: UIElement): UIElementType {
    const tag = element.tagName.toLowerCase();
    const classStr = element.classes.join(' ').toLowerCase();
    const id = (element.attributes['id'] || '').toLowerCase();
    const role = (element.attributes['role'] || '').toLowerCase();

    // 1. Navigation / Header
    if (tag === 'nav' || tag === 'header' || role === 'navigation' || classStr.includes('navbar') || classStr.includes('nav-') || id.includes('nav') || id.includes('header')) {
      return 'navigation';
    }

    // 2. Hero Section
    if (classStr.includes('hero') || id.includes('hero') || (tag === 'section' && element.depth <= 2 && classStr.includes('gradient'))) {
      return 'hero';
    }

    // 3. Button
    if (tag === 'button' || role === 'button' || (tag === 'a' && (classStr.includes('btn') || classStr.includes('button') || (classStr.includes('rounded') && classStr.includes('px-') && classStr.includes('bg-'))))) {
      return 'button';
    }

    // 4. Headings
    if (/^h[1-6]$/.test(tag) || role === 'heading') {
      return 'heading';
    }

    // 5. Badges / Status Pills
    if (
      classStr.includes('badge') ||
      classStr.includes('pill') ||
      classStr.includes('tag') ||
      classStr.includes('chip') ||
      (tag === 'span' && classStr.includes('rounded-full') && (classStr.includes('text-xs') || classStr.includes('px-2')))
    ) {
      return 'badge';
    }

    // 6. Icons
    if (tag === 'svg' || tag === 'i' || classStr.includes('icon') || classStr.includes('sparkle') || classStr.includes('lucide')) {
      return 'icon';
    }

    // 7. Inputs
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return 'input';
    }

    // 8. Metric / Stat Card
    if (classStr.includes('metric') || classStr.includes('stat') || classStr.includes('kpi')) {
      return 'metric';
    }

    // 9. Table / Chart / Dialog
    if (tag === 'table' || classStr.includes('table')) return 'table';
    if (classStr.includes('chart') || classStr.includes('graph')) return 'chart';
    if (tag === 'dialog' || role === 'dialog' || classStr.includes('modal') || classStr.includes('dialog')) return 'dialog';

    // 10. Cards
    const isCardClass = classStr.includes('card') || classStr.includes('surface') || classStr.includes('panel') || classStr.includes('box');
    const hasCardVisuals = (element.styles?.radius !== undefined && element.styles.radius >= 6) &&
      (Boolean(element.styles?.border) || Boolean(element.styles?.shadow)) &&
      Boolean(element.styles?.background);

    if (isCardClass || hasCardVisuals) {
      return 'card';
    }

    // 11. Text
    if (tag === 'p' || tag === 'span' || tag === 'small' || tag === 'label' || tag === 'li') {
      return 'text';
    }

    // 12. Images
    if (tag === 'img' || tag === 'picture' || tag === 'figure') {
      return 'image';
    }

    // 13. Containers
    if (tag === 'div' || tag === 'section' || tag === 'main' || tag === 'aside' || tag === 'article') {
      return 'container';
    }

    return 'unknown';
  }

  public static calculateVisualTreatmentScore(element: UIElement): number {
    let score = 0;
    const styles = element.styles || {};
    const classStr = element.classes.join(' ').toLowerCase();

    // 1. gradient +1
    if (styles.gradient || classStr.includes('gradient')) score++;

    // 2. shadow +1
    if (styles.shadow || classStr.includes('shadow')) score++;

    // 3. border +1
    if (styles.border || classStr.includes('border')) score++;

    // 4. large radius (>=12px or rounded-2xl/3xl/full) +1
    if (styles.radius && styles.radius >= 12) score++;

    // 5. glow (blur-xl, blur-2xl, ambient colored shadow) +1
    if (styles.backdropBlur || classStr.includes('blur-') || classStr.includes('shadow-[0_0_') || classStr.includes('drop-shadow(')) score++;

    // 6. icon container (child icon or class) +1
    if (classStr.includes('icon-container') || classStr.includes('rounded-full p-') || classStr.includes('w-10 h-10 rounded')) score++;

    // 7. badge present +1
    if (element.type === 'badge' || classStr.includes('badge') || classStr.includes('pill')) score++;

    // 8. animation (pulse, spin, float, transition-all) +1
    if (styles.animation || classStr.includes('animate-') || classStr.includes('transition-all')) score++;

    // 9. accent bg (purple/cyan/indigo/pink) +1
    if (
      classStr.includes('purple') ||
      classStr.includes('violet') ||
      classStr.includes('indigo') ||
      classStr.includes('cyan') ||
      classStr.includes('fuchsia') ||
      (styles.background && (styles.background.includes('#8b5cf6') || styles.background.includes('#6366f1') || styles.background.includes('rgba(139,')))
    ) {
      score++;
    }

    return score;
  }
}
