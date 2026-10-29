export function startBackgroundHeartbeat() {
  // Runtime hazard: setInterval timer started without storing handle for clearInterval disposal
  setInterval(() => {
    console.log('heartbeat');
  }, 1000);
}

