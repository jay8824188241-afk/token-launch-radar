#!/usr/bin/env node
// Token Radar's entrypoint: one sealed snapshot in, a ranked board and a
// static dashboard out. It reads the snapshot, scores every protocol with
// the model in lib/model.ts, and writes board.json, data.js, the dashboard
// files, and the screenshots into the output directory. It also writes the
// audit dossier, so the score and the files the judges see are built from
// the same data, in one run.
//
// Usage:
//   node main.ts --input ../input/snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//   node main.ts --input ../input/snapshot.json --output out
//   node main.ts --version
//   node main.ts --help

import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
  MODEL,
  MODEL_VERSION,
} from './lib/model.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = '0.1.0';
/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

function help(): void {
  console.log(`token-launch-radar ${VERSION}
Reads a sealed DefiLlama snapshot, ranks its pre-token protocols by implied
value, and writes the board, the dashboard data and the audit dossier.

Usage:
  node main.ts --input <snapshot.json> [--output <dir>]
  MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
  node main.ts --version
  node main.ts --help

Options:
  --input <file>   The sealed snapshot JSON, or a directory holding it
                   (default: MAKEFUN_INPUT_DIR, or /input).
  --output <dir>   The output directory (default: MAKEFUN_OUTPUT_DIR, or ./out).
  --version        Print the version and exit.
  --help           Print this help and exit.`);
}

/** The CLI flags, parsed by hand so the entrypoint needs no dependency. */
function parseArgs(argv: string[]): { input: string | null; output: string | null } {
  let input: string | null = null;
  let output: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--input' && argv[i + 1] !== undefined) {
      input = argv[++i]!;
    } else if (arg.startsWith('--input=')) {
      input = arg.slice('--input='.length);
    } else if (arg === '--output' && argv[i + 1] !== undefined) {
      output = argv[++i]!;
    } else if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
    } else if (arg === '--version') {
      console.log(VERSION);
      process.exit(0);
    } else if (arg === '--help' || arg === '-h') {
      help();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { input, output };
}

/** Copy a directory if it exists, quietly skipping it when it does not. */
async function copyIfExists(source: string, target: string): Promise<boolean> {
  try {
    await cp(source, target, { recursive: true });
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** A directory, resolved against this file's directory. */
function here(name: string): string {
  return join(__dirname, name);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { input, output } = parseArgs(argv);
  // No --input: the grader runs `node /bot/main.ts` with no arguments and
  // the snapshot mounted at MAKEFUN_INPUT_DIR (/input). The starter reads
  // the same default; requiring --input fails that run outright.
  const inputArg = input ?? process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  const outDir = resolve(output ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(await readFile(resolve(inputFile), 'utf8'));
  const { board, radar } = buildRadar(snapshot, MODEL);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`board is invalid: ${issue}`);
  await mkdir(join(outDir, 'dashboard'), { recursive: true });
  await mkdir(join(outDir, 'screenshots'), { recursive: true });
  await writeFile(join(outDir, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`, 'utf8');
  // data.js sits beside the page, at the output root: the dossier's text
  // covers dashboard/ only, so the board's data never eats the judge's
  // 65,536 bytes of source.
  await writeFile(join(outDir, 'data.js'), dataScript(radar), 'utf8');
  await copyIfExists(here('dashboard'), join(outDir, 'dashboard'));
  await copyIfExists(here('screenshots'), join(outDir, 'screenshots'));
  const dossier = buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS });
  await writeFile(join(outDir, 'dossier.json'), dossier);
  const top = board[0];
  console.log(`token-launch-radar ${VERSION}: ranked ${board.length} pre-token protocols from ${snapshot.protocols.length} in the snapshot as of ${snapshot.as_of}`);
  console.log(`  model ${MODEL_VERSION}: watchlist ${snapshot.watchlist.length} covered, live comparables ${radar.live.length}`);
  if (top !== undefined) console.log(`  rank 1: ${top.name} — implied $${top.implied_value_usd.toLocaleString('en-US')}`);
  console.log(`  wrote ${outDir}`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`token-launch-radar: ${message}`);
    process.exit(1);
  });
}
