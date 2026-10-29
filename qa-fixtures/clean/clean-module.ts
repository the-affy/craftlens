// Fixture: Clean, fully compliant TypeScript module
export interface UserData {
  id: string;
  name: string;
}

export function sanitizeUser(user: unknown): UserData | null {
  if (!user || typeof user !== 'object') {
    return null;
  }
  const u = user as Record<string, unknown>;
  if (typeof u.id !== 'string' || typeof u.name !== 'string') {
    return null;
  }
  return {
    id: u.id.trim(),
    name: u.name.trim(),
  };
}

