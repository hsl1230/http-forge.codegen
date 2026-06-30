/**
 * Snippet Generator
 *
 * Converts an HTTP Forge request into a copy-paste code snippet for various
 * languages/tools: cURL, JavaScript (fetch), Python (requests).
 *
 * All generators are pure functions that take a RequestInfo and return a string.
 */

import type { RequestInfo } from './parser';

export type SnippetLanguage = 'curl' | 'fetch' | 'python';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert {{variable}} placeholders to a language-appropriate form. */
function resolveVariables(value: string, lang: SnippetLanguage): string {
    switch (lang) {
        case 'curl':
            // Leave as-is; CI users supply via env vars
            return value.replace(/\{\{(\$?[\w.]+)\}\}/g, (_, name) => `\${${name}}`);
        case 'fetch':
            return value.replace(/\{\{(\$?[\w.]+)\}\}/g, (_, name) => `\${${name}}`);
        case 'python':
            return value.replace(/\{\{(\$?[\w.]+)\}\}/g, (_, name) => `{${name}}`);
    }
}

function quoteShell(value: string): string {
    // Single-quote the value; escape any embedded single quotes
    return `'${value.replace(/'/g, "'\\''")}'`;
}

function enabledHeaders(req: RequestInfo): Array<[string, string]> {
    if (!req.headers) return [];
    return Object.entries(req.headers);
}

function enabledQuery(req: RequestInfo): Array<[string, string]> {
    if (!req.queryParams) return [];
    return Object.entries(req.queryParams);
}

function bodyString(req: RequestInfo): string | null {
    if (!req.body) return null;
    if (typeof req.body === 'string') return req.body;
    try { return JSON.stringify(req.body, null, 2); } catch { return null; }
}

// ── cURL ──────────────────────────────────────────────────────────────────────

function toCurl(req: RequestInfo): string {
    const lines: string[] = [];
    const method = req.method.toUpperCase();

    // Build URL with query string
    let url = resolveVariables(req.url, 'curl');
    const qs = enabledQuery(req);
    if (qs.length > 0) {
        const params = qs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(resolveVariables(v, 'curl'))}`).join('&');
        url += (url.includes('?') ? '&' : '?') + params;
    }

    lines.push(`curl -X ${method} \\`);
    lines.push(`  ${quoteShell(url)} \\`);

    for (const [k, v] of enabledHeaders(req)) {
        lines.push(`  -H ${quoteShell(`${k}: ${resolveVariables(v, 'curl')}`)} \\`);
    }

    const body = bodyString(req);
    if (body) {
        const ct = req.bodyType === 'json' ? 'application/json' : 'text/plain';
        if (!req.headers?.['Content-Type'] && !req.headers?.['content-type']) {
            lines.push(`  -H ${quoteShell(`Content-Type: ${ct}`)} \\`);
        }
        lines.push(`  -d ${quoteShell(body)} \\`);
    }

    // Remove trailing backslash from last line
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith(' \\') ? last.slice(0, -2) : last;

    return lines.join('\n');
}

// ── JavaScript fetch ──────────────────────────────────────────────────────────

function toFetch(req: RequestInfo): string {
    const method = req.method.toUpperCase();
    const headers = enabledHeaders(req);
    const qs = enabledQuery(req);
    const body = bodyString(req);

    let url = resolveVariables(req.url, 'fetch');
    if (qs.length > 0) {
        const params = qs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(resolveVariables(v, 'fetch'))}`).join('&');
        url += (url.includes('?') ? '&' : '?') + params;
    }

    const lines: string[] = [];
    lines.push(`const response = await fetch(\`${url}\`, {`);
    lines.push(`  method: '${method}',`);

    if (headers.length > 0 || body) {
        lines.push(`  headers: {`);
        for (const [k, v] of headers) {
            lines.push(`    '${k}': \`${resolveVariables(v, 'fetch')}\`,`);
        }
        if (body && req.bodyType === 'json') {
            if (!req.headers?.['Content-Type'] && !req.headers?.['content-type']) {
                lines.push(`    'Content-Type': 'application/json',`);
            }
        }
        lines.push(`  },`);
    }

    if (body) {
        if (req.bodyType === 'json') {
            lines.push(`  body: JSON.stringify(${body}),`);
        } else {
            lines.push(`  body: \`${body}\`,`);
        }
    }

    lines.push(`});`);
    lines.push(``);
    lines.push(`const data = await response.json();`);
    lines.push(`console.log(data);`);

    return lines.join('\n');
}

// ── Python requests ───────────────────────────────────────────────────────────

function toPython(req: RequestInfo): string {
    const method = req.method.toLowerCase();
    const headers = enabledHeaders(req);
    const qs = enabledQuery(req);
    const body = bodyString(req);

    let url = resolveVariables(req.url, 'python');

    const lines: string[] = [];
    lines.push(`import requests`);
    lines.push(``);

    if (url.includes('{')) {
        lines.push(`# Set variables before running`);
        const vars = [...url.matchAll(/\{([\w.]+)\}/g)].map(m => m[1]);
        for (const v of [...new Set(vars)]) {
            lines.push(`${v} = ""  # TODO: set value`);
        }
        lines.push(``);
    }

    if (headers.length > 0) {
        lines.push(`headers = {`);
        for (const [k, v] of headers) {
            lines.push(`    "${k}": f"${resolveVariables(v, 'python')}",`);
        }
        if (body && req.bodyType === 'json') {
            if (!req.headers?.['Content-Type'] && !req.headers?.['content-type']) {
                lines.push(`    "Content-Type": "application/json",`);
            }
        }
        lines.push(`}`);
        lines.push(``);
    }

    if (qs.length > 0) {
        lines.push(`params = {`);
        for (const [k, v] of qs) {
            lines.push(`    "${k}": f"${resolveVariables(v, 'python')}",`);
        }
        lines.push(`}`);
        lines.push(``);
    }

    let callArgs = `f"${url}"`;
    if (headers.length > 0) callArgs += `, headers=headers`;
    if (qs.length > 0) callArgs += `, params=params`;

    if (body) {
        if (req.bodyType === 'json') {
            lines.push(`payload = ${body}`);
            lines.push(``);
            callArgs += `, json=payload`;
        } else {
            lines.push(`data = """${body}"""`);
            lines.push(``);
            callArgs += `, data=data`;
        }
    }

    lines.push(`response = requests.${method}(${callArgs})`);
    lines.push(``);
    lines.push(`print(response.status_code)`);
    lines.push(`print(response.json())`);

    return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a code snippet for a request in the requested language.
 *
 * @param req  Parsed request info from the collection.
 * @param lang Target language/tool.
 * @returns    Ready-to-paste snippet string.
 */
export function generateSnippet(req: RequestInfo, lang: SnippetLanguage): string {
    switch (lang) {
        case 'curl':   return toCurl(req);
        case 'fetch':  return toFetch(req);
        case 'python': return toPython(req);
    }
}

export const SUPPORTED_LANGUAGES: SnippetLanguage[] = ['curl', 'fetch', 'python'];
