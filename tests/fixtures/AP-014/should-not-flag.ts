export interface UserRecord {
  id: string;
  name: string;
}

export function processData(input: unknown): UserRecord | null {
  if (typeof input === 'object' && input !== null && 'id' in input && 'name' in input) {
    return input as UserRecord;
  }
  return null;
}
