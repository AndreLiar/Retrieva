#!/usr/bin/env node
/**
 * Integration Test CLI Runner
 *
 * Runs integration tests via command line with various options.
 * Similar to Postman CLI / Newman for API testing automation.
 *
 * Usage:
 *   node run-integration-tests.js [options]
 *
 * Options:
 *   --suite <name>    Run specific test suite (health, auth, rag, conversation, all)
 *   --verbose         Enable verbose output
 *   --report <format> Output format (console, json, html)
 *   --output <file>   Output file for report
 *   --bail            Stop on first failure
 *   --help            Show help
 *
 * Examples:
 *   node run-integration-tests.js --suite all
 *   node run-integration-tests.js --suite auth --verbose
 *   node run-integration-tests.js --suite all --report json --output results.json
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  suite: 'all',
  verbose: false,
  report: 'console',
  output: null,
  bail: false,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--suite':
      options.suite = args[++i];
      break;
    case '--verbose':
      options.verbose = true;
      break;
    case '--report':
      options.report = args[++i];
      break;
    case '--output':
      options.output = args[++i];
      break;
    case '--bail':
      options.bail = true;
      break;
    case '--help':
      options.help = true;
      break;
  }
}

// Show help
if (options.help) {
  console.log(`
Integration Test CLI Runner
===========================

Runs integration tests via command line with various options.

Usage:
  node run-integration-tests.js [options]
  npm run test:integration [-- options]

Options:
  --suite <name>    Run specific test suite
                    Options: health, auth, rag, conversation, workspace,
                             analytics, memory, notification, evaluation, all (default: all)
  --verbose         Enable verbose output
  --report <format> Output format: console, json, html (default: console)
  --output <file>   Output file for report
  --bail            Stop on first failure
  --help            Show this help

Examples:
  node run-integration-tests.js --suite all
  node run-integration-tests.js --suite auth --verbose
  node run-integration-tests.js --suite all --report json --output results.json
  npm run test:integration -- --suite health --bail
`);
  process.exit(0);
}

// Define test suites
const testSuites = {
  health: 'health.integration.test.js',
  auth: 'auth.integration.test.js',
  rag: 'rag.integration.test.js',
  conversation: 'conversation.integration.test.js',
  workspace: 'workspace.integration.test.js',
  analytics: 'analytics.integration.test.js',
  memory: 'memory.integration.test.js',
  notification: 'notification.integration.test.js',
  evaluation: 'evaluation.integration.test.js',
};

// Get test files to run
function getTestFiles(suiteName) {
  if (suiteName === 'all') {
    return Object.values(testSuites).map((file) => path.join(__dirname, file));
  }

  if (testSuites[suiteName]) {
    return [path.join(__dirname, testSuites[suiteName])];
  }

  console.error(`Unknown test suite: ${suiteName}`);
  console.error(`Available suites: ${Object.keys(testSuites).join(', ')}, all`);
  process.exit(1);
}

// Build vitest command
function buildCommand(testFiles) {
  const vitestArgs = ['vitest', 'run'];

  // Add test files
  vitestArgs.push(...testFiles);

  // Add reporter
  if (options.verbose) {
    vitestArgs.push('--reporter=verbose');
  } else {
    vitestArgs.push('--reporter=default');
  }

  // Add JSON reporter if needed
  if (options.report === 'json') {
    vitestArgs.push('--reporter=json');
    if (options.output) {
      vitestArgs.push(`--outputFile=${options.output}`);
    }
  }

  // Add bail option
  if (options.bail) {
    vitestArgs.push('--bail');
  }

  return vitestArgs;
}

// Run tests
async function runTests() {
  const startTime = Date.now();

  console.log('');
  console.log('================================================================================');
  console.log('  Integration Test Runner');
  console.log('================================================================================');
  console.log(`  Suite:   ${options.suite}`);
  console.log(`  Verbose: ${options.verbose}`);
  console.log(`  Bail:    ${options.bail}`);
  console.log('================================================================================');
  console.log('');

  const testFiles = getTestFiles(options.suite);
  console.log(`Running ${testFiles.length} test file(s):\n`);
  testFiles.forEach((file) => {
    console.log(`  - ${path.basename(file)}`);
  });
  console.log('');

  const vitestArgs = buildCommand(testFiles);

  return new Promise((resolve) => {
    const proc = spawn('npx', vitestArgs, {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('');
      console.log(
        '================================================================================'
      );
      console.log(`  Test run completed in ${duration}s`);
      console.log(`  Exit code: ${code}`);
      console.log(
        '================================================================================'
      );

      // Generate summary report
      if (options.report === 'json' && options.output) {
        console.log(`  Report saved to: ${options.output}`);
      }

      resolve(code);
    });

    proc.on('error', (err) => {
      console.error('Failed to start test process:', err);
      resolve(1);
    });
  });
}

// Export test collection for Postman-like workflow
export function getTestCollection() {
  return {
    info: {
      name: 'RAG Backend Integration Tests',
      description: 'API integration tests for the RAG backend system',
    },
    suites: Object.keys(testSuites).map((name) => ({
      name,
      file: testSuites[name],
    })),
    run: runTests,
  };
}

// Main execution
runTests().then((code) => {
  process.exit(code);
});
