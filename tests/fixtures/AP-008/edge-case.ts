// Catch without error variable binding
export function unhandledBinding() {
  try {
    dangerousCall();
  } catch {
  }
}

// Nested try catch blocks
export function nestedTryCatch() {
  try {
    step1();
  } catch (outer) {
    try {
      step2();
    } catch (inner) {
      // outer is handled via recovery below
    }
    console.error(outer);
  }
}
