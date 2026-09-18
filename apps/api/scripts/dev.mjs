import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
const childSpecs = [
  ['api', ['watch', 'src/main.ts']],
  ['report-export-worker', ['src/workers/report-export.worker.ts']]
];

const children = childSpecs.map(([name, args]) => ({
  name,
  process: spawn(process.execPath, [tsxCli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  })
}));

let stopping = false;
let exitCode = 0;
let remaining = children.length;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.process.exitCode === null && !child.process.killed) child.process.kill();
  }
}

for (const child of children) {
  child.process.once('error', (error) => {
    console.error(`[dev] ${child.name} failed to start:`, error instanceof Error ? error.message : error);
    stop(1);
  });
  child.process.once('exit', (code, signal) => {
    remaining -= 1;
    if (!stopping) {
      console.error(`[dev] ${child.name} stopped unexpectedly (${signal ?? code ?? 'unknown'}).`);
      stop(code && code > 0 ? code : 1);
    }
    if (remaining === 0) process.exitCode = exitCode;
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
