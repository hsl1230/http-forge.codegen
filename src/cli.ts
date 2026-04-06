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

// Force stdout to be unbuffered for npm compatibility
if (process.stdout.isTTY === false) {
    (process.stdout as any)._handle?.setBlocking?.(true);
}

const program = new Command();

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

program.parse();
