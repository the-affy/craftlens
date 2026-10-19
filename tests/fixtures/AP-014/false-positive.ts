// Untyped third-party interop with intentional comment should NOT be flagged
export function legacyBridge(legacyObj: any) { // legacy interop with untyped CJS library
  return legacyObj;
}
