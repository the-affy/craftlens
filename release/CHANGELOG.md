# Changelog

All notable changes to the CraftLens extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.15] - 2026-10-24

### Changed
- **Comprehensive CraftLens Rebrand & Architecture**:
  - Diagnostic Collection: Renamed VS Code diagnostic collection from `'CraftLens'` to `'CraftLens'`, surfacing clean `[CraftLens]` source badges across the Problems panel.
  - View Containers & Views: Configured Activity Bar container ID as `craftlens-view`, panel container as `craftlens-panel`, and primary views as `craftlens.sidebar` and `craftlens.detailPanel` with seamless legacy aliases.
  - Command Namespace Unification: Registered all extension commands under both `craftlens.<command>` namespace.
  - Quick Fix Suppressions: Updated quick fix generators to output `// craftlens-disable-next-line <ruleId>` and `/* craftlens-disable-file <ruleId> */` comments.
  - Settings & Configuration: Added full `craftlens.*` configuration schema schema.
  - User-Facing Copy: Replaced all legacy text strings, dialogs, quick picks, and status bar tooltips with CraftLens.
  - License: Updated copyright to CraftLens Contributors.

## [0.1.14] - 2026-10-24

### Added
- **Native Activity Bar Vector Icon (`media/icons/craftlens-sidebar.svg`)**:
  - Implemented authoritative vector CraftLens silhouette SVG (`viewBox="0 0 512 512"`, `fill="currentColor"`, transparent background `d="M0 0h512v512H0z"`).
  - Automatically adapts to both VS Code light and dark themes using native foreground color inheritance.
  - Crisp, pixel-aligned rendering at Activity Bar and Panel container sizes.

### Fixed
- **Command Declaration Warning (`craftlens.applyQuickFix`)**:
  - Declared `craftlens.applyQuickFix` in `contributes.commands` in `package.json` with title and icon, resolving the VS Code warning "Menu item references a command craftlens.applyQuickFix which is not defined in the 'commands' section".

## [0.1.13] - 2026-10-24

### Added
- **Official Marketplace & Activity Bar Brand Icons**:
  - Implemented full-color brand icon for VS Code Marketplace listing (`resources/icon.png`), preserving artwork exactly.
  - Implemented monochrome black-and-white icon specifically for VS Code Activity Bar and Panel headers (`resources/craftlens.svg` / `resources/craftlens.png`), naturally integrating with native VS Code theme contrast.
  - Purged obsolete `craftlens-sidebar.svg` references across the extension.

### Fixed
- **Runtime Event Error Resolution (`FAILED to handle event` / `FAILED to handle event add`)**:
  - Added explicit event contract normalization and handlers for `add`, `addSkill`, `add-skill`, `addUserRules`, and `add-user-rules` events in `CraftLensSidebarProvider` and `CraftLensDetailViewProvider`.
  - Hardened `CommandManager` skill commands (`craftlens.addSkill`, `craftlens.toggleSkill`, `craftlens.installSkill`, `craftlens.deleteSkill`, `craftlens.openSkillSource`) to support polymorphic arguments (strings, objects with `id`/`skillId`/`filePath`/`url`) and safe fallbacks.
  - Hardened `resolveFinding` to support finding objects, ID strings, and object wrappers with `findingId` or `id`.
  - Prevented duplicate event listener accumulation during sidebar and detail panel reopen/refresh cycles by tracking per-view disposables and releasing them on `onDidDispose`.
  - Wrapped all VS Code event subscribers (`DocumentWatcher` text/open/save/close listeners, `CraftLensInlineDecorationManager` editor listeners, config change handlers, and webview message dispatchers) in defensive `try/catch` blocks with structured diagnostic reporting.
  - Hardened `SkillRegistry.register` and `MarkdownSkillImporter` to handle missing metadata and unversioned user skills without throwing uncaught exceptions.

## [0.1.12] - 2026-10-24

### Improved
- Removed unnecessary emojis and decorative icons from the UI.
- Improved button hierarchy and interaction clarity.
- Reduced unnecessary cards, pills, and decorative elements.
- Improved spacing, typography, and visual consistency.
- Refined finding, Skills, Rules, and Metrics presentation.
- Removed the redundant round status indicator.
- Improved overall consistency across the extension.

## [0.1.11] - 2026-10-24

### Added
* **Real-Time Code & UI Diagnostics**: Static analysis engine evaluating TypeScript, JavaScript, React, Vue, Svelte, HTML, and CSS against UX, accessibility, performance, and code quality standards.
* **Interactive CraftLens Sidebar**: Multi-view activity bar container with dedicated tabs:
  * **Audit**: Severity-based finding navigator with direct code jumping.
  * **Checklist**: Live audit ledger linked to `.craftlens/checklist.md`.
  * **Skills**: Workflow skill management and activation.
  * **Rules**: Interactive rule inspector and toggle controls.
  * **Metrics**: Visual quality score and violation distribution graphs.
* **Contextual Design Recommendations**: Non-generic, pattern-aware architectural alternatives tailored to detected components and visual hierarchies.
* **Master Audit Checklist**: Automatically maintained project-level `.craftlens/checklist.md` document tracking pass/fail compliance.
* **Custom Rules Support**: Extensible declarative rule definition in `.craftlens/rules/*.yml`.
* **Side-by-Side Diff Previews**: Native VS Code diff viewer for previewing code suggestions prior to applying changes.
* **Official Marketplace Icon**: High-resolution 256x256 asset optimized for dark and light VS Code themes.

### Improved
* **Unified CraftLens Branding**: Completely updated user-facing titles, commands, tooltips, status bar items, and metadata for public Marketplace release.
* **Packaging Optimization**: Refined `.vscodeignore` to exclude development workspaces, source files, and intermediate TypeScript builds, ensuring a minimal VSIX footprint.
* **Diagnostic Compatibility**: Diagnostic adapter seamlessly supports both `CraftLens` diagnostics.

### Fixed
* **Webview Interaction Stability**: Fixed event delegation, message transport, and DOM state rehydration ensuring buttons, tabs, and skills remain fully interactive.
* **Finding Location Safety**: Hardened location navigation so that missing, out-of-bounds, or malformed AST ranges produce safe notices instead of uncaught exceptions.
* **Status Dot Removal**: Completely eliminated legacy round status dots and associated CSS from sidebar headers for a clean, intentional design.
* **Memory & Resource Cleanup**: Cleaned up obsolete test workspaces and temporary build outputs.
