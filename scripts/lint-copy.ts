/**
 * Copy lint.
 *
 * The operating blueprint is blunt: we have no speed advantage, and entering
 * the "fastest collection" race against funded national players is a losing
 * fight. Positioning does not drift because someone decides to change it — it
 * drifts because one well-meaning line of marketing copy says "instant" and
 * nobody notices for six months.
 *
 * So the ban is mechanical. This runs in CI and fails the build.
 *
 * Run: npm run lint:copy
 */

import fs from 'node:fs';
import path from 'node:path';

interface Rule {
  pattern: RegExp;
  why: string;
}

const BANNED: Rule[] = [
  {
    pattern: /\binstant(?:ly|aneous)?\b/i,
    why: 'Speed positioning. We compete on continuity, not immediacy.',
  },
  {
    pattern: /\b\d{1,2}[- ]minute\b/i,
    why: 'A minute-count SLA is the race we cannot win. Promise a window instead.',
  },
  {
    pattern: /\bfastest\b/i,
    why: 'Never claim to be the fastest. We are not, and we should not want to be.',
  },
  {
    pattern: /\bin minutes\b/i,
    why: 'Implies a speed promise we do not make.',
  },
  {
    pattern: /\bsame[- ]day\s+results?\b/i,
    why: 'A turnaround promise belongs to the laboratory, not to us.',
  },
  {
    pattern: /\bquickest\b|\bblazing\b|\blightning[- ]fast\b/i,
    why: 'Speed positioning.',
  },
  // Urgency and dark patterns. This audience is anxious by definition.
  {
    pattern: /\bonly\s+\d+\s+(?:slots?|spots?|left)\b/i,
    why: 'Manufactured scarcity aimed at worried families.',
  },
  {
    pattern: /\boffer\s+ends\b|\bhurry\b|\bact\s+now\b|\blimited\s+time\b/i,
    why: 'Urgency pressure. Never used on this audience.',
  },
  // Clinical overreach in user-facing copy.
  {
    pattern: /\bwe\s+diagnos/i,
    why: 'We are a coordination layer. The laboratory and the doctor diagnose.',
  },
  {
    pattern: /\bour\s+(?:nabl\s+)?accreditation\b/i,
    why: 'The accreditation is our partner laboratory’s, never ours.',
  },
];

/**
 * Files whose user-facing strings this lint governs. Deliberately includes the
 * translation dictionary — a banned promise is just as damaging in Hindi.
 */
const TARGETS = [
  'app',
  'components',
  'lib/i18n',
  'lib/brand.ts',
  'lib/providers/voice/prompt.ts',
];

const EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * The lint rules themselves quote the banned words, and so do the tests and
 * this file. Excluding them by path is simpler and more honest than inventing
 * an escape syntax nobody will remember to use.
 */
const EXCLUDED = [
  'scripts/lint-copy.ts',
  'tests/',
  'node_modules/',
  '.next/',
];

interface Finding {
  file: string;
  line: number;
  text: string;
  match: string;
  why: string;
}

/**
 * Negation guard.
 *
 * The sentences that state this policy necessarily contain the words it bans.
 * The product's own headline is "Not the fastest lab in the city", and the
 * voice agent's prompt says: never say "offer ends today". A naive word ban
 * flags exactly the lines that are doing the right thing.
 *
 * So the rule is about *claims*, not *mentions*: a banned word preceded by a
 * negator within a short window is policy text and passes.
 *
 * The trade-off is honest — a determined author could smuggle a claim past
 * this by prefixing "not". That is a worse failure mode than the alternative,
 * which is annotating every policy sentence with an escape comment nobody
 * remembers to add, and then trusting them anyway.
 */
const NEGATORS = /\b(?:no|not|never|without|avoid|avoids|don'?t|doesn'?t|refuse|refuses|stop|nor)\b/i;

/** How far back a negator may sit and still govern the banned word. */
const NEGATION_WINDOW = 24;

function isNegated(line: string, matchIndex: number): boolean {
  // Wide enough to span an article or two — "Not the fastest lab in the city"
  // is the product's own headline — and narrow enough that an unrelated "not"
  // earlier in a long sentence does not silently excuse a real claim.
  const before = line.slice(Math.max(0, matchIndex - NEGATION_WINDOW), matchIndex);
  return NEGATORS.test(before);
}

/** Strips JSX comments so `{/* ... "instant" ... *​/}` is not treated as copy. */
function stripComments(line: string): string {
  return line.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ');
}

function walk(target: string, found: string[] = []): string[] {
  const full = path.resolve(target);
  if (!fs.existsSync(full)) return found;

  const stat = fs.statSync(full);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(full))) found.push(full);
    return found;
  }

  for (const entry of fs.readdirSync(full)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    walk(path.join(full, entry), found);
  }
  return found;
}

function isExcluded(file: string): boolean {
  const rel = path.relative(process.cwd(), file);
  return EXCLUDED.some((ex) => rel.startsWith(ex) || rel.includes(ex));
}

function main() {
  const files = TARGETS.flatMap((t) => walk(t)).filter((f) => !isExcluded(f));
  const findings: Finding[] = [];

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      // Comments explain the rules; they are not shipped to anyone.
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('{/*')
      ) {
        return;
      }

      const scannable = stripComments(line);

      for (const rule of BANNED) {
        const match = scannable.match(rule.pattern);
        if (!match || match.index === undefined) continue;
        // A banned word that is being forbidden is not a violation.
        if (isNegated(scannable, match.index)) continue;

        findings.push({
          file: path.relative(process.cwd(), file),
          line: index + 1,
          text: trimmed.slice(0, 120),
          match: match[0],
          why: rule.why,
        });
      }
    });
  }

  if (findings.length === 0) {
    console.log(`
Copy lint passed — ${files.length} files checked.

No speed claims, no manufactured urgency, no clinical overreach.
`);
    return;
  }

  console.error(`\nCopy lint FAILED — ${findings.length} problem${findings.length === 1 ? '' : 's'}.\n`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}`);
    console.error(`    found:  "${finding.match}"`);
    console.error(`    why:    ${finding.why}`);
    console.error(`    line:   ${finding.text}`);
    console.error('');
  }
  console.error(
    'We do not compete on speed. Rewrite the copy, or if the rule is genuinely wrong,\nchange the rule in scripts/lint-copy.ts deliberately rather than working around it.\n',
  );
  process.exit(1);
}

main();
