# CraftLens 0.1.15

Complete namespace unification, diagnostic source rebranding, and release packaging.

A second pair of eyes for AI-generated software. Find problems, understand why they matter, and improve them.

## Highlights
- **Unified CraftLens Diagnostic Collection**: The VS Code diagnostic collection is now named `CraftLens`, eliminating the legacy `[craftlens]` tag from the Problems panel.
- **Command Engine**: All extension commands are registered under both `craftlens.<name>` and `craftlens.<name>`, ensuring forward and backward compatibility with all workflows, keybindings, and extensions.
- **CraftLens In-Code Suppressions**: Quick fix suppressions now generate `// craftlens-disable-next-line` and `/* craftlens-disable-file */` comments (while legacy `craftlens-disable-*` comments remain recognized).
- **Native Activity Bar Vector Icon (`media/icons/craftlens-sidebar.svg`)**: Vector CraftLens silhouette SVG (`viewBox="0 0 512 512"`, `fill="currentColor"`, transparent background `d="M0 0h512v512H0z"`). Adapts seamlessly to light and dark themes using native foreground color inheritance.
- **Preserved Marketplace Brand Icon**: The full-color captain brand artwork (`resources/icon.png`) remains active for the VS Code Marketplace.
- **Preserved Release History**: Retained `craftlens-0.1.11.vsix`, `craftlens-0.1.12.vsix`, `craftlens-0.1.13.vsix`, and `craftlens-0.1.14.vsix` alongside the new `craftlens-0.1.15.vsix` in `release/`.
