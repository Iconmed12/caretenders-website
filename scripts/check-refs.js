#!/usr/bin/env node
// Pre-push safety check for the Cana platform.
// 1. node --check style syntax validation of every JS file
// 2. For each HTML page, collects the JS files it loads (in order) and flags
//    any bare function call whose name is not defined in that page's script set.
// This catches the "function exists in admin but not on the public site" class
// of bug that broke the site three times on 11 Jun 2026.

const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');

// Browser / library globals that are always available
const GLOBALS = new Set([
  // JS builtins
  'Object','Array','String','Number','Boolean','Math','JSON','Date','RegExp','Promise',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent',
  'encodeURI','decodeURI','Error','Map','Set','Symbol','Proxy','Reflect','Intl','BigInt',
  'setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame',
  'structuredClone','queueMicrotask','escape','unescape','Uint8Array','Uint16Array','Uint32Array','Int8Array','Float32Array','Float64Array','ArrayBuffer','DataView','TextEncoder','TextDecoder',
  // Browser
  'fetch','alert','confirm','prompt','atob','btoa','FormData','URLSearchParams','URL',
  'FileReader','Blob','File','AbortController','IntersectionObserver','MutationObserver',
  'ResizeObserver','CustomEvent','Event','Image','Audio','WebSocket','XMLHttpRequest',
  'DOMParser','Notification','matchMedia','getComputedStyle','scrollTo','scrollBy',
  'addEventListener','removeEventListener','dispatchEvent','open','close','print','focus','blur',
  // Libraries loaded via CDN on these pages
  'supabase','mammoth','Stripe',
]);

const KEYWORDS = new Set([
  'if','for','while','switch','catch','return','typeof','instanceof','in','of','new',
  'function','async','await','do','else','try','finally','throw','delete','void','yield',
  'class','extends','super','this','case','default','break','continue','var','let','const',
]);

function jsFilesForHtml(htmlFile) {
  const html = fs.readFileSync(path.join(PUB, htmlFile), 'utf8');
  const files = [];
  const re = /<script[^>]+src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (src.startsWith('http')) continue; // CDN
    const local = src.replace(/^\//, '');
    if (fs.existsSync(path.join(PUB, local))) files.push(local);
  }
  return files;
}

function stripCommentsAndStrings(code) {
  // Crude but effective: remove strings, template literals, comments, regex literals
  return code
    .replace(/`(?:\\`|[^`])*`/g, '``')
    .replace(/'(?:\\'|[^'\n])*'/g, "''")
    .replace(/"(?:\\"|[^"\n])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // regex literals: /.../flags preceded by = ( , : ! & | ? or start of statement
    .replace(/(^|[=(,:!&|?\s])\/(?:\\\/|\[(?:\\\]|[^\]])*\]|[^\/\n])+\/[gimsuy]*/g, '$1 null ');
}

function definedNames(code) {
  const names = new Set();
  let m;
  const fnRe = /(?:^|[^.\w])function\s+([A-Za-z_$][\w$]*)/g;
  while ((m = fnRe.exec(code))) names.add(m[1]);
  const varRe = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = varRe.exec(code))) names.add(m[1]);
  // function params and catch params produce false negatives we accept
  const winRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = winRe.exec(code))) names.add(m[1]);
  // function parameters (declarations, expressions, arrows)
  const paramRe = /function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = paramRe.exec(code))) {
    const raw = m[1] || m[2] || m[3] || '';
    raw.split(',').forEach(pp => {
      const n = pp.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  }
  // destructuring consts: const { a, b } = ...
  const destrRe = /(?:var|let|const)\s*\{([^}]+)\}/g;
  while ((m = destrRe.exec(code))) {
    m[1].split(',').forEach(p => {
      const n = p.split(':').pop().trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  }
  return names;
}

function calledNames(code) {
  const calls = new Set();
  let m;
  // bare calls only: not preceded by . or word char
  const callRe = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = callRe.exec(code))) {
    const name = m[1];
    if (!KEYWORDS.has(name)) calls.add(name);
  }
  return calls;
}

function inlineHandlerCalls(htmlFile) {
  const html = fs.readFileSync(path.join(PUB, htmlFile), 'utf8');
  const calls = new Set();
  const re = /on(?:click|change|input|submit|drop|dragover|dragleave|load|keyup|keydown)="([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(html))) { if (!KEYWORDS.has(m[1])) calls.add(m[1]); }
  return calls;
}

// ── Pages to check: every html file with local scripts ──
const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));
let failures = 0;

for (const page of pages) {
  const scripts = jsFilesForHtml(page);
  if (!scripts.length) continue;

  let allCode = '';
  for (const s of scripts) allCode += fs.readFileSync(path.join(PUB, s), 'utf8') + '\n';
  const cleaned = stripCommentsAndStrings(allCode);

  const defined = definedNames(cleaned);
  const called = calledNames(cleaned);
  const handlers = inlineHandlerCalls(page);

  const missing = [];
  for (const c of called) {
    if (!defined.has(c) && !GLOBALS.has(c)) missing.push(c);
  }
  const missingHandlers = [];
  for (const h of handlers) {
    if (!defined.has(h) && !GLOBALS.has(h)) missingHandlers.push(h);
  }

  if (missing.length || missingHandlers.length) {
    failures++;
    console.log(`\nFAIL ${page} (scripts: ${scripts.join(', ')})`);
    if (missing.length) console.log('  Undefined in JS:        ' + missing.sort().join(', '));
    if (missingHandlers.length) console.log('  Undefined HTML handlers: ' + missingHandlers.sort().join(', '));
  } else {
    console.log(`PASS ${page}`);
  }
}

process.exit(failures ? 1 : 0);
