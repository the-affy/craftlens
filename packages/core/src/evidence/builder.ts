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
