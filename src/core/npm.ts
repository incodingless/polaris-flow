/**
 * npm install utility.
 */

import { execSync } from 'child_process';

/**
 * Install a package globally via npm. Returns true on success.
 */
export async function installNpmPackage(packageName: string, minVersion: string): Promise<boolean> {
  try {
    execSync(`npm install -g ${packageName}@latest`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    console.error(`  ✗ npm install -g ${packageName}@latest failed`);
    console.error(`    Manual install: npm install -g ${packageName}@latest`);
    console.error(`    Minimum version required: >= ${minVersion}`);
    return false;
  }
}

/**
 * Get the installed version of a global npm package. Returns '0.0.0' on failure.
 */
export function getNpmPackageVersion(packageName: string): string {
  try {
    const output = execSync(`npm list -g ${packageName} --json`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);
    return data.dependencies?.[packageName]?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
