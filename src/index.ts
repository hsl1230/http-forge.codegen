/**
 * @http-forge/codegen
 * 
 * Code generator for creating typed API clients from HTTP Forge collections.
 * 
 * Features:
 * - Generate TypeScript request functions from request.json files
 * - Full autocomplete support for parameters, headers, and body
 * - Environment variable resolution with {{variable}} syntax
 * - Barrel file generation for easy imports
 * - Single request, collection, or full generation
 * 
 * Usage:
 * ```bash
 * # CLI - all collections
 * npx http-forge-codegen --input ./collections --output ./api-clients
 * 
 * # CLI - single request
 * npx http-forge-codegen -i ./collections -o ./api-clients -r forgerock-login/login-request
 * 
 * # CLI - single collection
 * npx http-forge-codegen -i ./collections -o ./api-clients -c forgerock-login
 * 
 * # Programmatic
 * import { generateClients, generateSingleRequest } from '@http-forge/codegen';
 * await generateSingleRequest({ input: './collections', output: './api-clients', request: 'forgerock-login/login-request' });
 * ```
 */

export {
    generateClients, generateCollection, generateSingleRequest, type CollectionOptions, type GeneratorOptions,
    type SingleRequestOptions
} from './generator';
export { parseCollection, parseRequest, type CollectionInfo, type RequestInfo, type TypedParam } from './parser';
export { generateSnippet, SUPPORTED_LANGUAGES, type SnippetLanguage } from './snippet-generator';

