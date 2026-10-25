import { Evidence, EvidenceType, SourceLocation } from '../types/index.js';

export function createEvidence(
  type: EvidenceType,
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return {
    type,
    explanation,
    location,
    snippet,
    metadata,
  };
}

export function astEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('ast', explanation, location, snippet, metadata);
}

export function typeEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('type', explanation, location, snippet, metadata);
}

export function heuristicEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('heuristic', explanation, location, snippet, metadata);
}

export function regexEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('regex', explanation, location, snippet, metadata);
}

export function cssEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('css', explanation, location, snippet, metadata);
}

export function semanticEvidence(
  explanation: string,
  location?: SourceLocation,
  snippet?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return createEvidence('semantic', explanation, location, snippet, metadata);
}

