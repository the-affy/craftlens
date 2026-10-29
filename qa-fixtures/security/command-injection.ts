import * as child_process from 'node:child_process';

export function runDynamicCommand(userInput: string) {
  // Security hazard: dynamic string template in exec allows command injection
  child_process.exec(`ping -c 1 ${userInput}`);
}

