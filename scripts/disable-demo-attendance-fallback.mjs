import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/admin/AbsensiTab.tsx');
let source = fs.readFileSync(file, 'utf8');

// Build-time only. Never writes to Firebase.
function replaceDemoFallback(text) {
  const marker = 'if (data.length === 0)';
  let from = 0;
  let changed = false;

  while (true) {
    const start = text.indexOf(marker, from);
    if (start < 0) break;
    const braceStart = text.indexOf('{', start);
    if (braceStart < 0) break;

    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end < 0) break;

    const block = text.slice(start, end);
    if (block.includes('DEFAULT_ATTENDANCE')) {
      const indent = text.slice(text.lastIndexOf('\n', start) + 1, start).match(/^\s*/)?.[0] || '';
      const replacement = `${indent}if (data.length === 0) {\n${indent}    // Firestore is authoritative; no stored record means no attendance.\n${indent}    data = [];\n${indent}}`;
      text = text.slice(0, start) + replacement + text.slice(end);
      from = start + replacement.length;
      changed = true;
    } else {
      from = end;
    }
  }
  return { text, changed };
}

const result = replaceDemoFallback(source);
if (result.changed) {
  fs.writeFileSync(file, result.text, 'utf8');
  console.log('Demo attendance fallback disabled.');
} else {
  console.log('Demo attendance fallback already disabled; continuing build.');
}
