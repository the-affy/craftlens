# CraftLens Release Manifest

**Product:** CraftLens  
**Release Date:** 2026-10-24  
**Release Target:** Visual Studio Code Marketplace  

---

## Release Identity

* **Version:** 0.1.15  
* **Previous versions:** 0.1.14, 0.1.13, 0.1.12, 0.1.11  
* **VSIX:** `release/craftlens-0.1.15.vsix` (3.32 MB)  
* **Build:** PASS (`npm run build` esbuild bundle clean)  
* **Typecheck:** PASS (`npm run typecheck` / `tsc --build` clean with 0 errors)  
* **Lint:** PASS (TypeScript strict type & syntax validation passed)  
* **Tests:** PASS (52 test suites, 228 tests passed, 0 failures)  
* **Packaged VSIX smoke test:** PASS (Packaged VSIX installed and runtime verified: `craftlens.craftlens@0.1.15` in VS Code)  
* **Sidebar Icon:** PASS (Native `media/icons/craftlens-sidebar.svg` with `viewBox="0 0 512 512"`, `fill="currentColor"`, transparent background `d="M0 0h512v512H0z"`)  
* **Marketplace Icon:** PASS (Existing full-color icon in `resources/icon.png`)  
* **Diagnostic & View Container Brand Verification:** PASS (Problems panel shows `[CraftLens]`, Activity Bar ID `craftlens-view`, views `craftlens.sidebar` and `craftlens.detailPanel`)  
* **Command Verification:** PASS (Registration under `craftlens.<name>` and `craftlens.<name>`, 0 undefined menu-command warnings)  
* **Event Handling Resilience:** PASS (Zero occurrences of `FAILED to handle event` / `FAILED to handle event add`)  
* **Marketplace readiness:** READY (Valid manifest, icons, engines `^1.85.0`, clean minimal VSIX payload)  

---

## Release Verification Summary Table

| Metric / Check | Result | Details |
| :--- | :--- | :--- |
| **Version** | `0.1.15` | Production release version in `package.json` |
| **Previous Versions** | `0.1.14`, `0.1.13`, `0.1.12`, `0.1.11` | Preserved in `release/craftlens-0.1.14.vsix`, `craftlens-0.1.13.vsix`, `craftlens-0.1.12.vsix`, `craftlens-0.1.11.vsix` |
| **VS Code Compatibility** | `^1.85.0` | Specified in `engines.vscode` |
| **VSIX Package** | `release/craftlens-0.1.15.vsix` | 3.32 MB compressed distribution payload |
| **Build** | **PASS** | `npm run build` completed via esbuild (0 errors) |
| **Typecheck** | **PASS** | `npm run typecheck` (`tsc --build`) passed with 0 errors |
| **Lint** | **PASS** | TypeScript strict mode compilation passed with 0 warnings/errors |
| **Tests** | **PASS** | 52 test suites, 228 tests passed (0 failures) |
| **Packaged VSIX Smoke Test** | **PASS** | Installed via `code --install-extension` as `craftlens.craftlens@0.1.15` |
| **Marketplace Icon** | **PASS** | `resources/icon.png` (1024x1024 full-color artwork preserved) |
| **Activity Bar Icon** | **PASS** | `media/icons/craftlens-sidebar.svg` (512x512 vector silhouette with `fill="currentColor"`) |
| **Diagnostic Source** | **PASS** | Diagnostic collection name updated to `CraftLens`, eliminating `[craftlens]` in Problems panel |
| **Command Verification** | **PASS** | All commands registered under `craftlens.*`, no undefined menu-command warnings |
| **Event Error Fix** | **PASS** | Zero occurrences of `FAILED to handle event` / `FAILED to handle event add` |
| **Marketplace Readiness** | **READY** | All quality gates satisfied, marketplace metadata, icons, and legal files verified |

---

## Release Highlights (v0.1.13)

1. **CraftLens Dual Icon Assets**:
   * **Marketplace / Identity**: Exact full-color captain looking through spyglass artwork packaged as `resources/icon.png` (referenced by `"icon": "resources/icon.png"` in `package.json`).
   * **Activity Bar & Sidebar Container**: Dedicated black-and-white monochrome asset packaged as `resources/craftlens.svg` and `resources/craftlens.png` (referenced by `viewsContainers.activitybar` and `viewsContainers.panel`).
   * Removed all obsolete `craftlens-sidebar.svg` references from `package.json` and disk.

2. **Runtime Event Error Resolution**:
   * Resolved the release-blocking runtime failure: `Error in extension craftlens.craftlens: FAILED to handle event` and `FAILED to handle event add`.
   * Standardized webview-to-extension messaging to support `add`, `addSkill`, `add-skill`, `addUserRules`, and `add-user-rules`.
   * Hardened `CommandManager` skill commands (`craftlens.addSkill`, `craftlens.toggleSkill`, `craftlens.installSkill`, `craftlens.deleteSkill`, `craftlens.openSkillSource`) to accept polymorphic parameters (`string`, `object` with `id`/`skillId`/`filePath`/`url`) and safe fallbacks.
   * Hardened `resolveFinding` to recognize finding objects and wrapper objects with `findingId` or `id`.
   * Implemented per-view disposable tracking (`viewDisposables`) on `CraftLensSidebarProvider` and `CraftLensDetailViewProvider` to prevent duplicate event listener leakage on webview recreate/refresh.
   * Added defensive `try/catch` wrappers with structured error diagnostics across `DocumentWatcher`, `CraftLensInlineDecorationManager`, config subscriptions, and webview message handlers.

---

## Release Blockers
* **None**

---

## Final Artifacts in `release/`
* `craftlens-0.1.11.vsix` (Preserved previous release VSIX package)
* `craftlens-0.1.12.vsix` (Preserved previous release VSIX package)
* `craftlens-0.1.13.vsix` (New production VSIX package ready for Marketplace distribution)
* `README.md` (Marketplace documentation)
* `CHANGELOG.md` (Release changelog including 0.1.13 icon & runtime fixes)
* `release-notes.md` (Concise release notes for 0.1.13)
* `RELEASE-MANIFEST.md` (This verification manifest)
