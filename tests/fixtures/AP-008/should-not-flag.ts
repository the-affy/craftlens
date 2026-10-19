export function safeOperation() {
  try {
    JSON.parse('{}');
  } catch (error) {
    console.error('Failed to parse json:', error);
  }
}

export function propagatingOperation() {
  try {
    performTask();
  } catch (error) {
    throw new Error('Task failed', { cause: error });
  }
}

export function fallbackOperation() {
  try {
    return computeValue();
  } catch {
    return 'default-fallback';
  }
}
