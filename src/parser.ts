/**
 * Collection Parser
 * 
 * Reads and parses HTTP Forge collection structure (request.json files)
 * to extract request metadata for code generation.
 */

import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';

/**
 * Path parameter with optional constraint
 */
export interface PathParam {
    /** Parameter name */
    name: string;
    /** Regex constraint from URL (e.g., "RECORDING|VOD|PROGRAM") */
    constraint?: string;
    /** Whether parameter is optional (has ? suffix) */
    optional?: boolean;
}

/**
 * Typed parameter metadata from request.json (query, header, or path param)
 */
export interface TypedParam {
    /** Parameter name */
    key: string;
    /** Default value */
    value: string;
    /** Whether the parameter is enabled */
    enabled?: boolean;
    /** Data type for code generation */
    type?: 'string' | 'integer' | 'number' | 'boolean' | 'array';
    /** Whether the parameter is required */
    required?: boolean;
    /** Human-readable description */
    description?: string;
    /** Value format (e.g., date-time, uuid, email) */
    format?: string;
    /** Allowed values */
    enum?: string[];
    /** Whether this parameter is deprecated */
    deprecated?: boolean;
}

/**
 * Information about a single request
 */
export interface RequestInfo {
    /** Request name (folder name) */
    name: string;
    /** Request path relative to collection */
    path: string;
    /** HTTP method */
    method: string;
    /** URL template with {{variables}} */
    url: string;
    /** Query parameters from request.json (simple key-value) */
    queryParams?: Record<string, string>;
    /** Headers from request.json (simple key-value) */
    headers?: Record<string, string>;
    /** Body structure (if present) */
    body?: unknown;
    /** Body type (json, form, etc.) */
    bodyType?: string;
    /** Description from request.json */
    description?: string;
    /** Path parameters extracted from URL */
    pathParams: PathParam[];
    /** Variables used in the request */
    variables: string[];
    /** Full typed query parameters with metadata */
    typedQuery?: TypedParam[];
    /** Full typed headers with metadata */
    typedHeaders?: TypedParam[];
    /** Full typed path parameters from request.json params field */
    typedPathParams?: Record<string, TypedParam>;
    /** Parsed body.schema.json (JSON Schema for request body) */
    bodySchema?: unknown;
    /** Parsed response.schema.json (response schemas per status code) */
    responseSchema?: unknown;
}

/**
 * Information about a collection
 */
export interface CollectionInfo {
    /** Collection name (folder name) */
    name: string;
    /** Collection path */
    path: string;
    /** All requests in the collection */
    requests: RequestInfo[];
    /** Nested folders */
    folders: FolderInfo[];
}

/**
 * Information about a folder within a collection
 */
export interface FolderInfo {
    /** Folder name */
    name: string;
    /** Folder path relative to collection */
    path: string;
    /** Requests in this folder */
    requests: RequestInfo[];
}

/**
 * Extract {{variable}} names from a string
 */
function extractVariables(text: string): string[] {
    if (typeof text !== 'string') return [];
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
}

/**
 * Extract path parameters from URL with their constraints
 * Examples:
 *   :id -> { name: 'id' }
 *   :contentType(VOD|PROGRAM) -> { name: 'contentType', constraint: 'VOD|PROGRAM' }
 *   :userId? -> { name: 'userId', optional: true }
 */
function extractPathParams(url: string): PathParam[] {
    if (typeof url !== 'string') return [];
    
    // Extract only the path portion of the URL (exclude protocol, host, port, query)
    let path = url;
    
    // Remove query string
    const queryIndex = path.indexOf('?');
    if (queryIndex !== -1) {
        path = path.substring(0, queryIndex);
    }
    
    // Remove protocol and host if present
    const protocolMatch = path.match(/^https?:\/\/[^\/]+(\/.*)?$/);
    if (protocolMatch) {
        path = protocolMatch[1] || '/';
    }
    
    // Extract parameters with constraints: :paramName(constraint)?
    const paramRegex = /:(\w+)(?:\(([^)]+)\))?(\?)?/g;
    const params: PathParam[] = [];
    const seen = new Set<string>();
    
    let match;
    while ((match = paramRegex.exec(path)) !== null) {
        const name = match[1];
        const constraint = match[2]; // Can be undefined
        const optional = match[3] === '?';
        
        // Deduplicate by name
        if (!seen.has(name)) {
            seen.add(name);
            params.push({
                name,
                constraint,
                optional
            });
        }
    }
    
    return params;
}

/**
 * Convert array format headers/params to object format
 * HTTP Forge stores as: [{ key: "x", value: "y", enabled: true }]
 * We need: { "x": "y" }
 */
function arrayToObject(arr: unknown): Record<string, string> {
    if (!arr) return {};
    
    // Already an object
    if (!Array.isArray(arr)) {
        return arr as Record<string, string>;
    }
    
    // Convert array format to object
    const result: Record<string, string> = {};
    for (const item of arr) {
        if (item && typeof item === 'object' && 'key' in item) {
            const { key, value } = item as { key: string; value: string };
            // Include all items regardless of enabled state
            result[key] = value || '';
        }
    }
    return result;
}

/**
 * Extract typed parameter metadata from array-format params
 */
function extractTypedParams(arr: unknown): TypedParam[] | undefined {
    if (!arr || !Array.isArray(arr)) return undefined;
    
    const params: TypedParam[] = [];
    for (const item of arr) {
        if (item && typeof item === 'object' && 'key' in item) {
            const param: TypedParam = {
                key: (item as any).key,
                value: (item as any).value || '',
            };
            if ('enabled' in item) param.enabled = (item as any).enabled;
            if ('type' in item) param.type = (item as any).type;
            if ('required' in item) param.required = (item as any).required;
            if ('description' in item) param.description = (item as any).description;
            if ('format' in item) param.format = (item as any).format;
            if ('enum' in item) param.enum = (item as any).enum;
            if ('deprecated' in item) param.deprecated = (item as any).deprecated;
            params.push(param);
        }
    }
    
    // Only return if at least one param has type metadata
    const hasMetadata = params.some(p => p.type || p.required || p.description || p.format || p.enum || p.deprecated);
    return hasMetadata ? params : undefined;
}

/**
 * Extract typed path parameters from request.json params field
 */
function extractTypedPathParams(params: unknown): Record<string, TypedParam> | undefined {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;
    
    const result: Record<string, TypedParam> = {};
    let hasMetadata = false;
    
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
        if (typeof value === 'string') {
            result[key] = { key, value };
        } else if (value && typeof value === 'object') {
            const entry = value as any;
            const param: TypedParam = {
                key,
                value: entry.value || '',
            };
            if ('type' in entry) { param.type = entry.type; hasMetadata = true; }
            if ('description' in entry) { param.description = entry.description; hasMetadata = true; }
            if ('format' in entry) { param.format = entry.format; hasMetadata = true; }
            if ('enum' in entry) { param.enum = entry.enum; hasMetadata = true; }
            if ('deprecated' in entry) { param.deprecated = entry.deprecated; hasMetadata = true; }
            result[key] = param;
        }
    }
    
    return hasMetadata ? result : undefined;
}

/**
 * Read a JSON file if it exists, return undefined otherwise
 */
function readJsonIfExists(filePath: string): unknown | undefined {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch {
        // Ignore parse errors
    }
    return undefined;
}

/**
 * Extract all variables from a request
 */
function extractAllVariables(request: RequestInfo): string[] {
    const vars = new Set<string>();
    
    // From URL
    extractVariables(request.url).forEach(v => vars.add(v));
    
    // From headers
    if (request.headers) {
        Object.values(request.headers).forEach(value => {
            extractVariables(value).forEach(v => vars.add(v));
        });
    }
    
    // From query params
    if (request.queryParams) {
        Object.values(request.queryParams).forEach(value => {
            extractVariables(value).forEach(v => vars.add(v));
        });
    }
    
    // From body (recursively)
    if (request.body) {
        const bodyStr = JSON.stringify(request.body);
        extractVariables(bodyStr).forEach(v => vars.add(v));
    }
    
    return [...vars];
}

/**
 * Parse a request.json file (internal)
 */
function parseRequestJson(filePath: string, basePath: string): RequestInfo | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        
        const requestDir = path.dirname(filePath);
        const name = path.basename(requestDir);
        const relativePath = path.relative(basePath, requestDir).replace(/\\/g, '/');
        
        // Read body from separate file if exists
        let body = json.body;
        let bodyType = json.bodyType;
        
        // Extract body type from body structure if present
        if (body && typeof body === 'object' && 'type' in body) {
            bodyType = body.type;
        }
        
        const bodyJsonPath = path.join(requestDir, 'body.json');
        if (fs.existsSync(bodyJsonPath)) {
            const bodyContent = JSON.parse(fs.readFileSync(bodyJsonPath, 'utf-8'));
            body = bodyContent;
            // If body.json also has type field, use it
            if (bodyContent && typeof bodyContent === 'object' && 'type' in bodyContent) {
                bodyType = bodyContent.type;
            } else {
                bodyType = 'json';
            }
        } else if (bodyType === 'raw' && body && typeof body === 'object' && 'type' in body) {
            // For raw body types, actual content lives in external files (body.json, body.xml, etc.)
            // The body object here is just configuration metadata, not request data
            body = undefined;
        }
        
        // Read schema files if they exist
        const bodySchema = readJsonIfExists(path.join(requestDir, 'body.schema.json'));
        const responseSchema = readJsonIfExists(path.join(requestDir, 'response.schema.json'));
        
        // Extract typed metadata from params
        const typedQuery = extractTypedParams(json.query);
        const typedHeaders = extractTypedParams(json.headers);
        const typedPathParams = extractTypedPathParams(json.params);
        
        const request: RequestInfo = {
            name,
            path: relativePath,
            method: json.method || 'GET',
            url: json.url || '',
            queryParams: arrayToObject(json.query),  // Convert from array format
            headers: arrayToObject(json.headers),     // Convert from array format
            body,
            bodyType,
            description: json.description,
            pathParams: extractPathParams(json.url || ''),
            variables: [],
            typedQuery,
            typedHeaders,
            typedPathParams,
            bodySchema,
            responseSchema,
        };
        
        // Also include path params from json.params if present
        if (json.params && typeof json.params === 'object' && !Array.isArray(json.params)) {
            // Merge path params values
            for (const [key, value] of Object.entries(json.params)) {
                if (typeof value === 'string' && value) {
                    request.queryParams = request.queryParams || {};
                    // Store in a separate pathParamValues if needed
                }
            }
        }
        
        request.variables = extractAllVariables(request);
        
        return request;
    } catch (error) {
        console.error(`Error parsing ${filePath}:`, error);
        return null;
    }
}

/**
 * Parse a single request.json file (public API)
 * 
 * @param requestJsonPath - Path to the request.json file
 * @param collectionPath - Path to the collection root (for relative path calculation)
 * @returns RequestInfo or null if parsing fails
 */
export function parseRequest(requestJsonPath: string, collectionPath: string): RequestInfo | null {
    return parseRequestJson(requestJsonPath, collectionPath);
}

/**
 * Parse an entire collection directory
 */
export async function parseCollection(collectionPath: string): Promise<CollectionInfo> {
    const name = path.basename(collectionPath);
    const requests: RequestInfo[] = [];
    const foldersMap = new Map<string, FolderInfo>();
    
    // Find all request.json files
    const pattern = path.join(collectionPath, '**/request.json').replace(/\\/g, '/');
    const files = await glob(pattern);
    
    for (const file of files) {
        const request = parseRequestJson(file, collectionPath);
        if (request) {
            requests.push(request);
            
            // Track folder structure
            const parts = request.path.split('/');
            if (parts.length > 1) {
                const folderPath = parts.slice(0, -1).join('/');
                const folderName = parts[parts.length - 2];
                
                if (!foldersMap.has(folderPath)) {
                    foldersMap.set(folderPath, {
                        name: folderName,
                        path: folderPath,
                        requests: [],
                    });
                }
                foldersMap.get(folderPath)!.requests.push(request);
            }
        }
    }
    
    return {
        name,
        path: collectionPath,
        requests,
        folders: [...foldersMap.values()],
    };
}

/**
 * Parse all collections in a directory
 */
export async function parseCollections(rootPath: string): Promise<CollectionInfo[]> {
    const collections: CollectionInfo[] = [];
    
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const collectionPath = path.join(rootPath, entry.name);
            
            // Check if it looks like a collection (has request.json files)
            const pattern = path.join(collectionPath, '**/request.json').replace(/\\/g, '/');
            const hasRequests = (await glob(pattern)).length > 0;
            
            if (hasRequests) {
                const collection = await parseCollection(collectionPath);
                collections.push(collection);
            }
        }
    }
    
    return collections;
}
