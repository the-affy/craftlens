import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Discovers all workspace packages in the monorepo by inspecting root package.json workspaces.
 */
export function getWorkspacePackages(rootDir) {
  const rootPkgPath = path.resolve(rootDir, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  const workspaceGlobs = rootPkg.workspaces || [];

  const packages = [];

  for (const pattern of workspaceGlobs) {
    if (pattern.endsWith('/*')) {
      const parentDir = path.resolve(rootDir, pattern.slice(0, -2));
      if (fs.existsSync(parentDir)) {
        const entries = fs.readdirSync(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pkgDir = path.join(parentDir, entry.name);
            const pkgJsonPath = path.join(pkgDir, 'package.json');
            if (fs.existsSync(pkgJsonPath)) {
              const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
              packages.push({
                name: pkgJson.name,
                version: pkgJson.version,
                dir: pkgDir,
                relPath: path.relative(rootDir, pkgDir),
                pkgJson,
                isApp: pattern.startsWith('apps'),
              });
            }
          }
        }
      }
    } else {
      const pkgDir = path.resolve(rootDir, pattern);
      const pkgJsonPath = path.join(pkgDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        packages.push({
          name: pkgJson.name,
          version: pkgJson.version,
          dir: pkgDir,
          relPath: path.relative(rootDir, pkgDir),
          pkgJson,
          isApp: pattern.startsWith('apps'),
        });
      }
    }
  }

  return packages;
}

/**
 * Computes topological build order using Kahn's algorithm with cycle detection.
 * Ensures dependencies are built before dependent packages.
 */
export function getBuildOrder(rootDir) {
  const packages = getWorkspacePackages(rootDir);
  const pkgMap = new Map(packages.map(p => [p.name, p]));
  const knownNames = new Set(pkgMap.keys());

  // Determine internal dependencies for each workspace package
  const dependenciesOf = new Map();
  for (const pkg of packages) {
    const allDeps = {
      ...(pkg.pkgJson.dependencies || {}),
      ...(pkg.pkgJson.devDependencies || {}),
    };
    const internalDeps = Object.keys(allDeps).filter(dep => knownNames.has(dep) && dep !== pkg.name);
    dependenciesOf.set(pkg.name, new Set(internalDeps));
  }

  // in-degree of pkg = number of unbuilt dependencies
  const inDegree = new Map();
  for (const [pkgName, deps] of dependenciesOf) {
    inDegree.set(pkgName, deps.size);
  }

  const queue = [];
  for (const [pkgName, deg] of inDegree) {
    if (deg === 0) {
      queue.push(pkgName);
    }
  }

  const sortedNames = [];
  while (queue.length > 0) {
    // Sort queue for deterministic build ordering
    queue.sort();
    const current = queue.shift();
    sortedNames.push(current);

    for (const [pkgName, deps] of dependenciesOf) {
      if (deps.has(current)) {
        deps.delete(current);
        const newDeg = inDegree.get(pkgName) - 1;
        inDegree.set(pkgName, newDeg);
        if (newDeg === 0) {
          queue.push(pkgName);
        }
      }
    }
  }

  if (sortedNames.length !== packages.length) {
    const unvisited = packages.filter(p => !sortedNames.includes(p.name)).map(p => p.name);
    throw new Error(`Circular dependency detected involving packages: ${unvisited.join(', ')}`);
  }

  return sortedNames.map(name => pkgMap.get(name));
}

/**
 * Builds workspace packages in strict topological order.
 *
 * @param {string} rootDir Workspace root directory
 * @param {object} options
 * @param {boolean} options.packagesOnly If true, only builds library packages in packages/*
 */
export function buildWorkspacePackages(rootDir, options = {}) {
  const order = getBuildOrder(rootDir);
  const targets = options.packagesOnly ? order.filter(p => !p.isApp) : order;

  console.log(`\n======================================================`);
  console.log(`🔨 Building ${targets.length} workspace target(s) in topological order`);
  console.log(`======================================================`);

  for (let i = 0; i < targets.length; i++) {
    const pkg = targets[i];
    console.log(`[${i + 1}/${targets.length}] Building ${pkg.name} (${pkg.relPath})...`);

    execSync('npm run build', {
      cwd: pkg.dir,
      stdio: 'inherit',
    });

    // Verify expected entry point artifact
    const expectedFile = pkg.isApp
      ? path.resolve(pkg.dir, 'dist', 'extension.js')
      : path.resolve(pkg.dir, 'dist', 'index.js');

    if (!fs.existsSync(expectedFile)) {
      throw new Error(`Build failed for ${pkg.name}: expected artifact ${expectedFile} was not generated.`);
    }

    const stat = fs.statSync(expectedFile);
    if (stat.size === 0) {
      throw new Error(`Build failed for ${pkg.name}: generated artifact ${expectedFile} is empty.`);
    }
  }

  console.log(`\n✅ All ${targets.length} target(s) built successfully.\n`);
}

/**
 * Cleans build outputs and tsbuildinfo files across all workspaces safely.
 */
export function cleanWorkspaceArtifacts(rootDir) {
  const packages = getWorkspacePackages(rootDir);

  console.log(`🧹 Cleaning generated build artifacts across monorepo...`);

  for (const pkg of packages) {
    const distDir = path.resolve(pkg.dir, 'dist');
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
      console.log(`  Removed ${path.relative(rootDir, distDir)}`);
    }

    const tsbuildinfo = path.resolve(pkg.dir, 'tsconfig.tsbuildinfo');
    if (fs.existsSync(tsbuildinfo)) {
      fs.rmSync(tsbuildinfo, { force: true });
      console.log(`  Removed ${path.relative(rootDir, tsbuildinfo)}`);
    }
  }

  // Root level artifacts
  const rootDist = path.resolve(rootDir, 'dist');
  if (fs.existsSync(rootDist)) {
    fs.rmSync(rootDist, { recursive: true, force: true });
    console.log(`  Removed dist/`);
  }

  const rootTsbuildinfo = path.resolve(rootDir, 'tsconfig.tsbuildinfo');
  if (fs.existsSync(rootTsbuildinfo)) {
    fs.rmSync(rootTsbuildinfo, { force: true });
    console.log(`  Removed tsconfig.tsbuildinfo`);
  }

  // Clean root vsix files
  const rootFiles = fs.readdirSync(rootDir);
  for (const file of rootFiles) {
    if (file.endsWith('.vsix')) {
      fs.rmSync(path.resolve(rootDir, file), { force: true });
      console.log(`  Removed ${file}`);
    }
  }

  // Clean temp test fixtures
  const tempTestDir = path.resolve(rootDir, 'tests', 'fixtures');
  if (fs.existsSync(tempTestDir)) {
    const fixtureEntries = fs.readdirSync(tempTestDir);
    for (const entry of fixtureEntries) {
      if (entry.startsWith('vsix-temp')) {
        const fullPath = path.join(tempTestDir, entry);
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  Removed ${path.relative(rootDir, fullPath)}`);
      }
    }
  }

  console.log(`✅ Clean complete.\n`);
}

