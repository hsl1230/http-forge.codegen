/**
 * HTTP Forge Code Generator CLI
 * 
 * Generate typed TypeScript API clients from HTTP Forge collections.
 * 
 * Usage:
 *   # Generate all collections
 *   http-forge-codegen --input ./collections --output ./api-clients
 * 
 *   # Generate single request
 *   http-forge-codegen --input ./collections --output ./api-clients --request forgerock-login/login-request
 * 
 *   # Generate single collection
 *   http-forge-codegen --input ./collections --output ./api-clients --collection forgerock-login
 */

import { Command } from 'commander';
import * as path from 'path';
import { generateClients, generateCollection, generateSingleRequest } from './generator';
import { parseRequest } from './parser';
import { generateSnippet, SUPPORTED_LANGUAGES, type SnippetLanguage } from './snippet-generator';

// Force stdout to be unbuffered for npm compatibility
if (process.stdout.isTTY === false) {
    (process.stdout as any)._handle?.setBlocking?.(true);
}

const program = new Command();

const LEGACY_NOTICE =
    'Notice: "http-forge-codegen" is a legacy command alias. Prefer "http-forge generate" via @http-forge/cli for the unified HTTP Forge CLI experience.';

let printedLegacyNotice = false;

function printLegacyNotice(): void {
    if (printedLegacyNotice) return;
    printedLegacyNotice = true;
    console.error(`[DEPRECATED] ${LEGACY_NOTICE}`);
}

program
    .name('http-forge-codegen')
    .description('Generate typed TypeScript API clients from HTTP Forge collections')
    .version('0.1.0')
    .requiredOption('-i, --input <path>', 'Input directory containing collections')
    .requiredOption('-o, --output <path>', 'Output directory for generated files')
    .option('-r, --request <path>', 'Generate single request (e.g., forgerock-login/login-request)')
    .option('-c, --collection <name>', 'Generate single collection (e.g., forgerock-login)')
    .option('--overwrite', 'Overwrite existing files', false)
    .option('--types-only', 'Generate only type definitions', false)
    .option('--no-barrel', 'Skip barrel (index.ts) file generation', false)
    .action(async (options) => {
        printLegacyNotice();
        try {
            const inputPath = path.resolve(process.cwd(), options.input);
            const outputPath = path.resolve(process.cwd(), options.output);
            
            if (options.request) {
                // Generate single request
                await generateSingleRequest({
                    input: inputPath,
                    output: outputPath,
                    request: options.request,
                    overwrite: options.overwrite,
                    typesOnly: options.typesOnly,
                    updateBarrel: options.barrel,
                });
            } else if (options.collection) {
                // Generate single collection
                await generateCollection({
                    input: inputPath,
                    output: outputPath,
                    collection: options.collection,
                    overwrite: options.overwrite,
                    typesOnly: options.typesOnly,
                    updateBarrel: options.barrel,
                });
            } else {
                // Generate all collections
                await generateClients({
                    input: inputPath,
                    output: outputPath,
                    overwrite: options.overwrite,
                    typesOnly: options.typesOnly,
                });
            }
            
            process.exit(0);
        } catch (error) {
            console.error('Error:', error);
            process.exit(1);
        }
    });

program.addHelpText('beforeAll', `${LEGACY_NOTICE}\n\n`);

// ── Snippet subcommand ────────────────────────────────────────────────────────

const snippetCmd = new Command('snippet')
    .description('Generate a copy-paste code snippet from a single request')
    .requiredOption('-i, --input <path>', 'Path to the request.json file or its parent folder')
    .requiredOption('-l, --lang <lang>', `Target language: ${SUPPORTED_LANGUAGES.join(', ')}`)
    .option('-c, --collection <path>', 'Root collection directory (used to resolve relative request path)')
    .action((options) => {
        const lang = options.lang as SnippetLanguage;
        if (!SUPPORTED_LANGUAGES.includes(lang)) {
            console.error(`Unknown language "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
            process.exit(1);
        }

        // Accept either a request.json path or the containing directory
        let requestJsonPath = path.resolve(process.cwd(), options.input);
        const fs = require('fs') as typeof import('fs');
        if (fs.statSync(requestJsonPath).isDirectory()) {
            requestJsonPath = path.join(requestJsonPath, 'request.json');
        }

        const collectionPath = options.collection
            ? path.resolve(process.cwd(), options.collection)
            : path.dirname(path.dirname(requestJsonPath)); // heuristic: two levels up

        const req = parseRequest(requestJsonPath, collectionPath);
        if (!req) {
            console.error(`Failed to parse request at ${requestJsonPath}`);
            process.exit(1);
        }

        const snippet = generateSnippet(req, lang);
        process.stdout.write(snippet + '\n');
    });

program.addCommand(snippetCmd);

program.parse();
