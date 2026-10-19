// Catch block with intentional suppression/ignore comment should NOT be flagged
export function intentionalIgnore() {
  try {
    cleanUpTempFile();
  } catch {
    // intentional: file might already be removed, ignore
  }
}

export function expectedFailure() {
  try {
    probeFeature();
  } catch (e) {
    /* expected when feature is disabled */
  }
}
