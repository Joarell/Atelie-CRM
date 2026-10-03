#!/usr/bin/env node
/**
 * npm audit gate — blocks the build on HIGH/CRITICAL advisories
 * unless they are explicitly listed in the exception file.
 *
 * Exit codes:
 *   0 = clean or all advisories have exceptions
 *   1 = un-excepted HIGH/CRITICAL advisory found
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const EXCEPTIONS_FILE = 'scripts/npm-audit-exceptions.json';

function loadExceptions() {
  try {
    return JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) {
    console.error('npm audit failed:', result.error);
    process.exit(1);
  }
  return JSON.parse(result.stdout);
}

function isExcepted(pkgName, advisory, exceptions) {
  for (const exc of exceptions) {
    if (exc.package === pkgName &&
        (exc.advisory_id === advisory.source || exc.cve === advisory.cve)) {
      return true;
    }
  }
  return false;
}

function main() {
  const exceptions = loadExceptions();
  const audit = runAudit();

  // npm audit JSON structure: vulnerabilities is keyed by package name,
  // each entry has a `via` array containing advisory objects
  const blocking = [];
  for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via === 'object' && via !== null && via.source) {
        const adv = via;
        if ((adv.severity === 'high' || adv.severity === 'critical') &&
            !isExcepted(pkgName, adv, exceptions)) {
          blocking.push({ pkgName, adv });
        }
      }
    }
  }

  if (blocking.length > 0) {
    console.error('❌ npm audit gate FAILED — un-excepted HIGH/CRITICAL advisories:');
    for (const { pkgName, adv } of blocking) {
      console.error(`  - ${pkgName}: ${adv.title} (${adv.severity})`);
      console.error(`    Advisory: ${adv.source}${adv.cve ? `, CVE: ${adv.cve}` : ''}`);
      console.error(`    URL: ${adv.url}`);
    }
    console.error(`\nAdd exceptions to ${EXCEPTIONS_FILE} if these are acceptable.`);
    process.exit(1);
  }

  console.log('✅ npm audit gate passed — no un-excepted HIGH/CRITICAL advisories.');
  process.exit(0);
}

main();