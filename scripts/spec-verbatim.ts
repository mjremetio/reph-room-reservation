/**
 * Keeps the spec's verbatim copies of source files exact (docs/spec/10-rebuild.md, Keeping the spec exact).
 * In any docs/**\/*.md file, the fenced block right after a `<!-- verbatim: <path> -->` line holds that file's
 * exact content. The tests fail when one drifts, so the spec can always rebuild the app.
 *
 *   npm run spec:sync    rewrite every marked block from its file
 *   npm run spec:check   list the blocks that differ (exit 1)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const MARKER = /^<!-- verbatim: (\S+) -->$/;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? markdownFiles(p) : p.endsWith('.md') ? [p] : [];
  });
}

/** A fence longer than any run of backticks in the content, so files that contain ``` still nest safely. */
function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

interface Block {
  path: string;
  /** Line index of the opening fence and of the closing fence. */
  open: number;
  close: number;
  lang: string;
  body: string;
}

function blocks(lines: string[]): Block[] {
  const found: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER.exec(lines[i] as string);
    if (!m) continue;
    let open = i + 1;
    while (open < lines.length && (lines[open] as string).trim() === '') open++;
    const fence = /^(`{3,})(\S*)\s*$/.exec(lines[open] ?? '');
    if (!fence) throw new Error(`verbatim marker for ${m[1]} is not followed by a fenced block (line ${i + 1})`);
    const ticks = fence[1] as string;
    let close = open + 1;
    while (close < lines.length && (lines[close] as string).trim() !== ticks) close++;
    if (close >= lines.length) throw new Error(`unclosed block for ${m[1]} (line ${open + 1})`);
    found.push({ path: m[1] as string, open, close, lang: fence[2] as string, body: lines.slice(open + 1, close).join('\n') });
  }
  return found;
}

const expected = (root: string, path: string) => readFileSync(join(root, path), 'utf8').replace(/\n$/, '');

/** Every marked block whose content differs from its file: `doc` relative to the root. */
export function verbatimDrift(root: string): Array<{ doc: string; path: string }> {
  return markdownFiles(join(root, 'docs')).flatMap((doc) =>
    blocks(readFileSync(doc, 'utf8').split('\n'))
      .filter((b) => b.body !== expected(root, b.path))
      .map((b) => ({ doc: relative(root, doc), path: b.path })),
  );
}

/** Rewrites every marked block from its file; returns how many blocks changed. */
export function syncVerbatim(root: string): number {
  let changed = 0;
  for (const doc of markdownFiles(join(root, 'docs'))) {
    const lines = readFileSync(doc, 'utf8').split('\n');
    const found = blocks(lines);
    // Bottom-up, so earlier line numbers stay valid.
    for (const b of [...found].reverse()) {
      const content = expected(root, b.path);
      if (b.body === content) continue;
      const fence = fenceFor(content);
      lines.splice(b.open, b.close - b.open + 1, `${fence}${b.lang}`, ...content.split('\n'), fence);
      changed++;
    }
    writeFileSync(doc, lines.join('\n'));
  }
  return changed;
}

if (process.argv[1]?.endsWith('spec-verbatim.ts')) {
  const root = process.cwd();
  if (process.argv.includes('--check')) {
    const drift = verbatimDrift(root);
    for (const d of drift) console.log(`out of date: ${d.doc} ← ${d.path}`);
    console.log(drift.length ? `${drift.length} verbatim block(s) differ. Run npm run spec:sync.` : 'All verbatim blocks match their files.');
    if (drift.length) process.exitCode = 1;
  } else {
    console.log(`Updated ${syncVerbatim(root)} verbatim block(s).`);
  }
}
