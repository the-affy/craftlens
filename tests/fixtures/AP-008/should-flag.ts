export function riskyOperation() {
  try {
    JSON.parse('invalid json');
  } catch (error) {
  }
}

export function silentFailureWithNoop() {
  try {
    doSomething();
  } catch (e) {
    undefined;
  }
}
