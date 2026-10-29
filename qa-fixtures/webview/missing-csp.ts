export function getWebviewContent(): string {
  // Webview hazard: Full HTML document generated without Content Security Policy (CSP)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Sample Webview</title>
</head>
<body>
  <div id="duplicate-id">One</div>
  <div id="duplicate-id">Two</div>
</body>
</html>`;
}

