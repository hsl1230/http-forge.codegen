/**
 * Code Generator
 * 
 * Generates TypeScript API client files from parsed collections.
 * Supports generating:
 * - All collections at once
 * - Single collection
 * - Single request
 */

import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import { parseCollection, parseCollections, parseRequest, type CollectionInfo, type PathParam, type RequestInfo, type TypedParam } from './parser';

/**
 * Log to stderr to avoid npm buffering issues with stdout
 */
function log(...args: any[]) {
    console.error(...args);
}

// ────────────────────────────────────────────────────────────────────────────
// JSON Schema → TypeScript type conversion
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map JSON Schema type + format to a TypeScript type string
 */
function jsonSchemaTypeToTS(schema: any, components?: Record<string, any>): string {
    if (!schema) return 'unknown';

    // Handle $ref
    if (schema.$ref) {
        return resolveRef(schema.$ref, components);
    }

    // Handle enum
    if (schema.enum) {
        return schema.enum.map((v: any) =>
            typeof v === 'string' ? `'${v}'` : String(v)
        ).join(' | ');
    }

    // Handle oneOf / anyOf / allOf
    if (schema.oneOf) {
        return schema.oneOf.map((s: any) => jsonSchemaTypeToTS(s, components)).join(' | ');
    }
    if (schema.anyOf) {
        return schema.anyOf.map((s: any) => jsonSchemaTypeToTS(s, components)).join(' | ');
    }
    if (schema.allOf) {
        return schema.allOf.map((s: any) => jsonSchemaTypeToTS(s, components)).join(' & ');
    }

    switch (schema.type) {
        case 'string':
            return 'string';
        case 'integer':
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'null':
            return 'null';
        case 'array':
            if (schema.items) {
                const itemType = jsonSchemaTypeToTS(schema.items, components);
                return `${itemType}[]`;
            }
            return 'unknown[]';
        case 'object':
            return generateInlineObjectType(schema, components, '    ');
        default:
            // No type specified but has properties → object
            if (schema.properties) {
                return generateInlineObjectType(schema, components, '    ');
            }
            return 'unknown';
    }
}

/**
 * Resolve a $ref to a type name (handles #/components/Name and #/definitions/Name)
 */
function resolveRef(ref: string, components?: Record<string, any>): string {
    const parts = ref.split('/');
    const name = parts[parts.length - 1];
    // If we have the component definition, inline it; otherwise use the name as a type reference
    if (components && components[name]) {
        return jsonSchemaTypeToTS(components[name], components);
    }
    return toPascalCase(name);
}

/**
 * Generate an inline TypeScript object type from a JSON Schema with properties
 */
function generateInlineObjectType(schema: any, components: Record<string, any> | undefined, indent: string): string {
    if (!schema.properties) {
        if (schema.additionalProperties) {
            const valType = typeof schema.additionalProperties === 'object'
                ? jsonSchemaTypeToTS(schema.additionalProperties, components)
                : 'unknown';
            return `Record<string, ${valType}>`;
        }
        return 'Record<string, unknown>';
    }

    const requiredSet = new Set<string>(schema.required || []);
    const lines: string[] = ['{'];

    for (const [prop, propSchema] of Object.entries(schema.properties)) {
        const ps = propSchema as any;
        const tsType = jsonSchemaTypeToTS(ps, components);
        const optional = requiredSet.has(prop) ? '' : '?';
        const jsdocParts: string[] = [];
        if (ps.description) jsdocParts.push(ps.description);
        if (ps.format) jsdocParts.push(`@format ${ps.format}`);
        if (ps.example !== undefined) jsdocParts.push(`@example ${JSON.stringify(ps.example)}`);
        if (ps.deprecated) jsdocParts.push(`@deprecated`);

        if (jsdocParts.length > 0) {
            lines.push(`${indent}/** ${jsdocParts.join(' — ')} */`);
        }
        lines.push(`${indent}${prop}${optional}: ${tsType};`);
    }

    if (schema.additionalProperties) {
        const valType = typeof schema.additionalProperties === 'object'
            ? jsonSchemaTypeToTS(schema.additionalProperties, components)
            : 'unknown';
        lines.push(`${indent}[key: string]: ${valType};`);
    }

    lines.push(`${indent.slice(4)}}`);
    return lines.join('\n');
}

/**
 * Generate a full named TypeScript interface from a JSON Schema
 */
function generateInterfaceFromSchema(schema: any, name: string, components?: Record<string, any>): string {
    if (!schema || !schema.properties) {
        // Fallback: type alias
        const tsType = jsonSchemaTypeToTS(schema, components);
        return `export type ${name} = ${tsType};`;
    }

    const requiredSet = new Set<string>(schema.required || []);
    const lines: string[] = [];
    lines.push(`export interface ${name} {`);

    for (const [prop, propSchema] of Object.entries(schema.properties)) {
        const ps = propSchema as any;
        const tsType = jsonSchemaTypeToTS(ps, components);
        const optional = requiredSet.has(prop) ? '' : '?';
        const jsdocParts: string[] = [];
        if (ps.description) jsdocParts.push(ps.description);
        if (ps.format) jsdocParts.push(`@format ${ps.format}`);
        if (ps.example !== undefined) jsdocParts.push(`@example ${JSON.stringify(ps.example)}`);
        if (ps.deprecated) jsdocParts.push(`@deprecated`);

        if (jsdocParts.length > 0) {
            lines.push(`    /** ${jsdocParts.join(' — ')} */`);
        }
        lines.push(`    ${prop}${optional}: ${tsType};`);
    }

    lines.push('}');
    return lines.join('\n');
}

/**
 * Map a TypedParam type string to TypeScript type
 */
function typedParamToTS(param: TypedParam): string {
    if (param.enum && param.enum.length > 0) {
        return param.enum.map(v => `'${v}'`).join(' | ');
    }
    switch (param.type) {
        case 'integer':
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'array':
            return 'string[]';
        case 'string':
        default:
            return 'string';
    }
}

/**
 * Generate response type interfaces from response.schema.json
 */
function generateResponseInterfaces(responseSchema: any, name: string): string {
    if (!responseSchema || !responseSchema.responses) return '';
    
    const components = responseSchema.components;
    const lines: string[] = [];
    
    for (const [statusCode, responseDef] of Object.entries(responseSchema.responses)) {
        const rd = responseDef as any;
        const statusName = statusCode === 'default' ? 'Default' : statusCode;
        const interfaceName = `${name}Response${statusName}`;
        
        // Determine the schema to use (content map takes precedence over shorthand)
        let schema: any;
        if (rd.content) {
            // Use the first content type's schema
            const firstContentType = Object.keys(rd.content)[0];
            schema = rd.content[firstContentType]?.schema;
        } else {
            schema = rd.schema;
        }
        
        if (schema) {
            if (rd.description) {
                lines.push(`/** ${rd.description} */`);
            }
            lines.push(generateInterfaceFromSchema(schema, interfaceName, components));
            lines.push('');
        }
    }
    
    return lines.join('\n');
}

/**
 * Extract TypeScript type from regex constraint
 * Examples:
 *   "RECORDING|VOD|PROGRAM" -> "'RECORDING' | 'VOD' | 'PROGRAM'"
 *   "TELUS" -> "'TELUS'"
 *   Complex regex -> "string"
 *   No constraint -> "any"
 */
function extractTypeFromConstraint(constraint?: string): string {
    if (!constraint) {
        return 'any';
    }
    
    // Check if it's a simple alternation of literal values (A|B|C)
    const literals = constraint.split('|');
    const isSimpleAlternation = literals.every(lit => /^[A-Z0-9_]+$/.test(lit.trim()));
    
    if (isSimpleAlternation) {
        // Convert to TypeScript union type
        return literals.map(lit => `'${lit.trim()}'`).join(' | ');
    }
    
    // For complex regex patterns, fallback to string
    return 'string';
}

/**
 * Options for generating all collections
 */
export interface GeneratorOptions {
    /** Input directory containing collections */
    input: string;
    /** Output directory for generated files */
    output: string;
    /** Whether to overwrite existing files */
    overwrite?: boolean;
    /** Generate only types (no runtime code) */
    typesOnly?: boolean;
}

/**
 * Options for generating a single request
 */
export interface SingleRequestOptions {
    /** Input directory containing collections */
    input: string;
    /** Output directory for generated files */
    output: string;
    /** Request path (e.g., "forgerock-login/login-request") */
    request: string;
    /** Whether to overwrite existing files */
    overwrite?: boolean;
    /** Generate only types (no runtime code) */
    typesOnly?: boolean;
    /** Update barrel file after generation */
    updateBarrel?: boolean;
}

/**
 * Options for generating a single collection
 */
export interface CollectionOptions {
    /** Input directory containing collections */
    input: string;
    /** Output directory for generated files */
    output: string;
    /** Collection name (e.g., "forgerock-login") */
    collection: string;
    /** Whether to overwrite existing files */
    overwrite?: boolean;
    /** Generate only types (no runtime code) */
    typesOnly?: boolean;
    /** Update barrel file after generation */
    updateBarrel?: boolean;
}

/**
 * Convert kebab-case or snake_case to camelCase
 */
function toCamelCase(str: string): string {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Remove empty string values from an object recursively
 */
function removeEmptyStrings(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(removeEmptyStrings);
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
            result[key] = removeEmptyStrings(value);
        } else if (value !== '') {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Generate TypeScript interface for body type with proper nested objects and JSDoc comments
 */
function generateBodyInterface(body: unknown, name: string): string {
    if (!body || typeof body !== 'object') {
        return '';
    }
    
    const lines: string[] = [];
    
    function addProperties(obj: Record<string, unknown>, indent: string): void {
        for (const [key, value] of Object.entries(obj)) {
            const typeInfo = getTypeInfo(value, key);
            
            // Add JSDoc comment with default value for primitives
            if (typeInfo.defaultValue && !typeInfo.isNested) {
                lines.push(`${indent}/** @default ${typeInfo.defaultValue} */`);
            }
            
            lines.push(`${indent}${key}?: ${typeInfo.type};`);
        }
    }
    
    function getTypeInfo(value: unknown, key: string): { type: string; defaultValue: string; isNested: boolean } {
        if (value === null) {
            return { type: 'any', defaultValue: 'null', isNested: false };
        }
        
        if (typeof value === 'string') {
            return { type: 'any', defaultValue: `"${value}"`, isNested: false };
        }
        
        if (typeof value === 'number') {
            return { type: 'any', defaultValue: String(value), isNested: false };
        }
        
        if (typeof value === 'boolean') {
            return { type: 'any', defaultValue: String(value), isNested: false };
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return { type: 'any[]', defaultValue: '[]', isNested: false };
            }
            
            const firstItem = value[0];
            if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
                // Array of objects - generate inline type
                const itemType = generateInlineType(firstItem as Record<string, unknown>, '        ');
                return { type: `Array<${itemType}>`, defaultValue: '', isNested: true };
            } else {
                return { type: 'any[]', defaultValue: JSON.stringify(value), isNested: false };
            }
        }
        
        if (typeof value === 'object') {
            // Nested object - generate inline type
            const inlineType = generateInlineType(value as Record<string, unknown>, '        ');
            return { type: inlineType, defaultValue: '', isNested: true };
        }
        
        return { type: 'any', defaultValue: '', isNested: false };
    }
    
    function generateInlineType(obj: Record<string, unknown>, baseIndent: string): string {
        const typeLines: string[] = [];
        typeLines.push('{');
        
        for (const [nestedKey, nestedValue] of Object.entries(obj)) {
            const nestedTypeInfo = getTypeInfo(nestedValue, nestedKey);
            
            if (nestedTypeInfo.defaultValue && !nestedTypeInfo.isNested) {
                typeLines.push(`${baseIndent}/** @default ${nestedTypeInfo.defaultValue} */`);
            }
            typeLines.push(`${baseIndent}${nestedKey}?: ${nestedTypeInfo.type};`);
        }
        
        typeLines.push(`${baseIndent.slice(0, -4)}}`);
        return typeLines.join('\n    ');
    }
    
    lines.push(`export interface ${name}Body {`);
    addProperties(body as Record<string, unknown>, '    ');
    lines.push('}');
    
    return lines.join('\n');
}

/**
 * Generate query params interface with JSDoc comments
 */
function generateQueryInterface(params: Record<string, string>, name: string): string {
    const lines: string[] = [];
    lines.push(`export interface ${name}Query {`);
    
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            lines.push(`    /** @default "${value}" */`);
        }
        lines.push(`    ${key}?: any;`);
    }
    
    // Add index signature for compatibility
    lines.push(`    [key: string]: any;`);
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate typed query params interface using metadata from request.json
 */
function generateTypedQueryInterface(params: TypedParam[], name: string): string {
    const lines: string[] = [];
    lines.push(`export interface ${name}Query {`);
    
    for (const param of params) {
        const jsdocParts: string[] = [];
        if (param.description) jsdocParts.push(param.description);
        if (param.format) jsdocParts.push(`@format ${param.format}`);
        if (param.value) jsdocParts.push(`@default "${param.value}"`);
        if (param.deprecated) jsdocParts.push(`@deprecated`);
        
        if (jsdocParts.length > 0) {
            lines.push(`    /** ${jsdocParts.join(' — ')} */`);
        }
        
        const tsType = typedParamToTS(param);
        const optional = param.required ? '' : '?';
        lines.push(`    ${param.key}${optional}: ${tsType};`);
    }
    
    // Add index signature for compatibility
    lines.push(`    [key: string]: any;`);
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate headers interface extending HttpHeaders with request-specific headers
 */
function generateHeadersInterface(headers: Record<string, string> | undefined, name: string): string {
    const lines: string[] = [];
    lines.push(`export interface ${name}Headers extends HttpHeaders {`);
    
    // Add request-specific headers with JSDoc showing default values
    if (headers && Object.keys(headers).length > 0) {
        lines.push('    // Request-specific headers');
        for (const [key, value] of Object.entries(headers)) {
            if (value) {
                lines.push(`    /** @default "${value}" */`);
            }
            lines.push(`    '${key}'?: any;`);
        }
    }
    
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate typed headers interface using metadata from request.json
 */
function generateTypedHeadersInterface(params: TypedParam[], name: string): string {
    const lines: string[] = [];
    lines.push(`export interface ${name}Headers extends HttpHeaders {`);
    
    if (params.length > 0) {
        lines.push('    // Request-specific headers');
        for (const param of params) {
            const jsdocParts: string[] = [];
            if (param.description) jsdocParts.push(param.description);
            if (param.format) jsdocParts.push(`@format ${param.format}`);
            if (param.value) jsdocParts.push(`@default "${param.value}"`);
            if (param.deprecated) jsdocParts.push(`@deprecated`);
            
            if (jsdocParts.length > 0) {
                lines.push(`    /** ${jsdocParts.join(' — ')} */`);
            }
            
            const tsType = typedParamToTS(param);
            const optional = param.required ? '' : '?';
            lines.push(`    '${param.key}'${optional}: ${tsType};`);
        }
    }
    
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate path parameters interface with JSDoc comments
 */
function generatePathParamsInterface(pathParams: PathParam[], name: string): string {
    if (pathParams.length === 0) {
        return '';
    }
    
    const lines: string[] = [];
    lines.push(`export interface ${name}PathParams {`);
    
    for (const param of pathParams) {
        lines.push(`    /** Path parameter: ${param.name} */`);
        // Use quotes for numeric or invalid identifiers
        const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name);
        const paramKey = isValidIdentifier ? param.name : `'${param.name}'`;
        
        // Extract TypeScript type from constraint
        const paramType = extractTypeFromConstraint(param.constraint);
        const optionalMarker = param.optional ? '?' : '';
        
        lines.push(`    ${paramKey}${optionalMarker}: ${paramType};`);
    }
    
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate typed path parameters interface using metadata from request.json params field
 */
function generateTypedPathParamsInterface(pathParams: PathParam[], typedParams: Record<string, TypedParam>, name: string): string {
    if (pathParams.length === 0) {
        return '';
    }
    
    const lines: string[] = [];
    lines.push(`export interface ${name}PathParams {`);
    
    for (const param of pathParams) {
        const typed = typedParams[param.name];
        const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name);
        const paramKey = isValidIdentifier ? param.name : `'${param.name}'`;
        
        if (typed) {
            const jsdocParts: string[] = [];
            if (typed.description) jsdocParts.push(typed.description);
            else jsdocParts.push(`Path parameter: ${param.name}`);
            if (typed.format) jsdocParts.push(`@format ${typed.format}`);
            if (typed.deprecated) jsdocParts.push(`@deprecated`);
            
            lines.push(`    /** ${jsdocParts.join(' — ')} */`);
            
            const paramType = typedParamToTS(typed);
            const optionalMarker = param.optional ? '?' : '';
            lines.push(`    ${paramKey}${optionalMarker}: ${paramType};`);
        } else {
            lines.push(`    /** Path parameter: ${param.name} */`);
            const paramType = extractTypeFromConstraint(param.constraint);
            const optionalMarker = param.optional ? '?' : '';
            lines.push(`    ${paramKey}${optionalMarker}: ${paramType};`);
        }
    }
    
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate form-urlencoded body interface from content array
 */
function generateFormBodyInterface(bodyContent: any[], name: string): string {
    const lines: string[] = [];
    lines.push(`export interface ${name}Body {`);
    
    for (const item of bodyContent) {
        if (item && item.key) {
            const fieldName = item.key;
            const defaultValue = item.value || '';
            
            if (defaultValue) {
                lines.push(`    /** @default "${defaultValue}" */`);
            }
            lines.push(`    ${fieldName}?: string;`);
        }
    }
    
    lines.push('}');
    return lines.join('\n');
}

/**
 * Generate a single request file
 */
function generateRequestFile(request: RequestInfo, collectionName: string): string {
    const funcName = toCamelCase(request.name);
    const typeName = toPascalCase(request.name);
    
    const lines: string[] = [];
    
    // Header
    lines.push('/**');
    lines.push(` * ${request.name}`);
    if (request.description) {
        lines.push(` * ${request.description}`);
    }
    lines.push(` * `);
    lines.push(` * ${request.method} ${request.url}`);
    if (request.variables.length > 0) {
        lines.push(` * Variables: ${request.variables.join(', ')}`);
    }
    lines.push(' * ');
    lines.push(' * @generated by @http-forge/codegen');
    lines.push(' */');
    lines.push('');
    
    // Imports
    lines.push("import type { HttpHeaders, BaseRequestContext, BaseApiOptions } from '@http-forge/playwright';");
    lines.push("import type { APIResponse } from '@playwright/test';");
    lines.push('');
    
    // Generate custom headers interface (use typed metadata if available)
    if (request.typedHeaders) {
        lines.push(generateTypedHeadersInterface(request.typedHeaders, typeName));
    } else {
        lines.push(generateHeadersInterface(request.headers, typeName));
    }
    lines.push('');
    
    // Generate path params interface (use typed metadata if available)
    if (request.pathParams.length > 0) {
        if (request.typedPathParams) {
            lines.push(generateTypedPathParamsInterface(request.pathParams, request.typedPathParams, typeName));
        } else {
            lines.push(generatePathParamsInterface(request.pathParams, typeName));
        }
        lines.push('');
    }
    
    // Generate query params interface (use typed metadata if available)
    if (request.queryParams && Object.keys(request.queryParams).length > 0) {
        if (request.typedQuery) {
            lines.push(generateTypedQueryInterface(request.typedQuery, typeName));
        } else {
            lines.push(generateQueryInterface(request.queryParams, typeName));
        }
        lines.push('');
    }
    
    // Generate body interface (prefer body.schema.json when available)
    if (request.bodySchema && request.method.toUpperCase() !== 'GET') {
        const bs = request.bodySchema as any;
        const components = bs.components;
        // Determine schema (content map takes precedence over shorthand)
        let schema: any;
        if (bs.content) {
            const firstContentType = Object.keys(bs.content)[0];
            schema = bs.content[firstContentType]?.schema;
        } else {
            schema = bs.schema;
        }
        if (schema) {
            lines.push(generateInterfaceFromSchema(schema, `${typeName}Body`, components));
            lines.push('');
        }
    } else if (request.body && typeof request.body === 'object' && request.method.toUpperCase() !== 'GET') {
        const bodyType = request.bodyType || 'raw';
        const format = (request.body as any).format;
        
        // Use specialized interface for form-urlencoded and form-data
        if (bodyType === 'x-www-form-urlencoded' && (request.body as any).content) {
            lines.push(generateFormBodyInterface((request.body as any).content, typeName));
        } else if (bodyType === 'form-data' && (request.body as any).content) {
            lines.push(generateFormBodyInterface((request.body as any).content, typeName));
        } else if (bodyType === 'raw' && (format === 'text' || format === 'xml' || format === 'html' || format === 'javascript')) {
            // For non-JSON raw formats, use string type
            lines.push(`export type ${typeName}Body = string;`);
        } else if (bodyType === 'binary') {
            // Binary data as Buffer or base64 string
            lines.push(`export type ${typeName}Body = Buffer | string;`);
        } else if (bodyType === 'graphql') {
            // GraphQL body structure
            lines.push(`export interface ${typeName}Body {`);
            lines.push(`    /** GraphQL query string */`);
            lines.push(`    query?: string;`);
            lines.push(`    /** GraphQL variables */`);
            lines.push(`    variables?: Record<string, unknown>;`);
            lines.push(`    /** Operation name */`);
            lines.push(`    operationName?: string;`);
            lines.push(`}`);
        } else {
            // JSON or other object-based bodies
            lines.push(generateBodyInterface(request.body, typeName));
        }
        lines.push('');
    }
    
    // Generate response interfaces from response.schema.json if available
    if (request.responseSchema) {
        const responseTypes = generateResponseInterfaces(request.responseSchema, typeName);
        if (responseTypes) {
            lines.push(responseTypes);
        }
    }
    
    // Generate options interface
    lines.push(`export interface ${typeName}Options extends BaseRequestContext<${typeName}Headers>, BaseApiOptions {`);
    
    if (request.pathParams.length > 0) {
        lines.push('    /** Path parameters */');
        lines.push(`    params: ${typeName}PathParams;`);
    }
    
    if (request.queryParams && Object.keys(request.queryParams).length > 0) {
        lines.push('    /** Query parameters */');
        lines.push(`    query?: ${typeName}Query;`);
    }
    
    const hasBody = (request.bodySchema || request.body) && request.method.toUpperCase() !== 'GET';
    if (hasBody) {
        lines.push('    /** Request body */');
        lines.push(`    body?: ${typeName}Body;`);
    }
    
    lines.push('}');
    lines.push('');
    
    // Generate function
    lines.push('/**');
    lines.push(` * ${request.description || request.name}`);
    lines.push(' * ');
    lines.push(` * @example`);
    lines.push(' * ```typescript');
    lines.push(` * const response = await ${funcName}({ request, env });`);
    lines.push(' * ```');
    lines.push(' */');
    lines.push(`export async function ${funcName}(options: ${typeName}Options): Promise<APIResponse> {`);
    lines.push('    const { request, env } = options;');
    lines.push('    ');
    
    // Resolve URL with path params and query params
    lines.push('    // Resolve URL with variables');
    
    const hasPathParams = request.pathParams.length > 0;
    const hasQueryParams = request.queryParams && Object.keys(request.queryParams).length > 0;
    
    if (hasPathParams || hasQueryParams) {
        if (hasPathParams) {
            lines.push('    const pathParams: Record<string, string> = {');
            for (const param of request.pathParams) {
                // Use bracket notation for numeric or invalid identifiers
                const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name);
                const paramKey = isValidIdentifier ? param.name : `'${param.name}'`;
                const paramAccess = isValidIdentifier ? `options.params.${param.name}` : `options.params['${param.name}']`;
                lines.push(`        ${paramKey}: String(${paramAccess}),`);
            }
            lines.push('    };');
        }
        
        // Build buildUrl options object
        const buildUrlParts: string[] = [];
        if (hasPathParams) {
            buildUrlParts.push('params: pathParams');
        }
        if (hasQueryParams) {
            buildUrlParts.push('query: options.query ? Object.fromEntries(Object.entries(options.query).map(([k, v]) => [k, String(v)])) : undefined');
        }
        
        lines.push(`    const url = env.buildUrl('${request.url}', { ${buildUrlParts.join(', ')} });`);
    } else {
        lines.push(`    const url = env.resolve('${request.url}');`);
    }
    
    // Build headers
    lines.push('    ');
    lines.push('    // Build headers');
    lines.push('    const headers: Record<string, string> = {');
    if (request.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
            // Only include headers with non-empty values
            if (value && value.trim()) {
                lines.push(`        '${key}': env.resolve('${value}'),`);
            }
        }
    }
    lines.push('        ...(options.headers ? Object.fromEntries(Object.entries(options.headers).map(([k, v]) => [k, String(v)])) : {}),');
    lines.push('    };');
    
    // Build request options
    lines.push('    ');
    lines.push('    // Make request with Playwright');
    
    // Skip body for GET requests (HTTP standard)
    const shouldIncludeBody = (request.body || request.bodySchema) && request.method.toUpperCase() !== 'GET';
    
    if (shouldIncludeBody && !request.body && request.bodySchema) {
        // Schema-defined body with no sample data: accept options.body, no defaults
        lines.push('    // Build request body (typed by schema, no defaults)');
        lines.push('    const requestOptions: any = { headers };');
        lines.push('    if (options.body) {');
        lines.push('        requestOptions.data = env.resolveObject(options.body);');
        lines.push('    }');
        lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
        lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
        lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
        lines.push('    ');
        lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
    } else if (shouldIncludeBody) {
        const bodyType = request.bodyType || 'raw';
        
        // Handle different body types
        if (bodyType === 'x-www-form-urlencoded') {
            // Form URL-encoded: build form data object directly
            lines.push('    // Build form-urlencoded body');
            lines.push('    const formData: Record<string, string> = {');
            
            // Add default form fields
            const content = (request.body as any).content || [];
            for (const item of content) {
                if (item && item.key && item.enabled !== false) {
                    lines.push(`        ${item.key}: env.resolve('${item.value || ''}'),`);
                }
            }
            
            lines.push('        ...options.body, // User can override any field');
            lines.push('    };');
            lines.push('    ');
            lines.push('    // Build request options');
            lines.push('    const requestOptions: any = { headers, form: formData };');
            lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
            lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
            lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
            lines.push('    ');
            lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
        } else if (bodyType === 'form-data') {
            // Multipart form-data: check for files in original content
            lines.push('    // Build form-data body');
            const content = (request.body as any).content || [];
            const hasFiles = content.some((item: any) => item && item.type === 'file');
            
            if (hasFiles) {
                lines.push('    // Use multipart for file uploads');
                lines.push('    const multipartData: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {');
                
                for (const item of content) {
                    if (item && item.key && item.enabled !== false) {
                        if (item.type === 'file') {
                            lines.push(`        // TODO: ${item.key} - file upload (requires implementation)`);
                            lines.push(`        // ${item.key}: { name: '${item.value}', mimeType: 'application/octet-stream', buffer: Buffer.from('') },`);
                        } else {
                            lines.push(`        ${item.key}: env.resolve('${item.value || ''}'),`);
                        }
                    }
                }
                
                lines.push('        ...options.body,');
                lines.push('    };');
                lines.push('    ');
                lines.push('    // Build request options');
                lines.push('    const requestOptions: any = { headers, multipart: multipartData };');
                lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
                lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
                lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
                lines.push('    ');
                lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
            } else {
                // Text-only form-data, use form option
                lines.push('    // Use form for text-only fields');
                lines.push('    const formData: Record<string, string> = {');
                
                for (const item of content) {
                    if (item && item.key && item.enabled !== false) {
                        lines.push(`        ${item.key}: env.resolve('${item.value || ''}'),`);
                    }
                }
                
                lines.push('        ...options.body,');
                lines.push('    };');
                lines.push('    ');
                lines.push('    // Build request options');
                lines.push('    const requestOptions: any = { headers, form: formData };');
                lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
                lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
                lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
                lines.push('    ');
                lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
            };
        } else if (bodyType === 'raw' || bodyType === 'json' || !bodyType) {
            const format = (request.body as any).format || 'json';
            
            if (format === 'json' || bodyType === 'json' || !bodyType) {
                // JSON body: use 'data' option with object
                lines.push('    // Build JSON request body');
                const bodyContent = (request.body as any).content || request.body;
                const filteredBody = removeEmptyStrings(bodyContent);
                lines.push(`    const defaultBody = ${JSON.stringify(filteredBody, null, 4).split('\n').join('\n    ')};`);
                lines.push('    const body = options.body || defaultBody;');
                lines.push('    const resolvedBody = env.resolveObject(body);');
                lines.push('    ');
                lines.push('    // Build request options');
                lines.push('    const requestOptions: any = { headers, data: resolvedBody };');
                lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
                lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
                lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
                lines.push('    ');
                lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
            } else {
                // Text/XML/HTML/JavaScript: use 'data' option with string
                lines.push(`    // Build ${format} request body`);
                const bodyContent = (request.body as any).content || '';
                lines.push(`    const defaultBody = ${JSON.stringify(bodyContent)};`);
                lines.push('    const body = options.body ?? defaultBody;');
                lines.push('    const resolvedBody = env.resolve(body);');
                lines.push('    ');
                lines.push('    // Build request options');
                lines.push('    const requestOptions: any = { headers, data: resolvedBody };');
                lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
                lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
                lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
                lines.push('    ');
                lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
            }
        } else if (bodyType === 'binary') {
            // Binary body: handle Buffer or base64 string
            lines.push('    // Build binary request body');
            lines.push('    const body = options.body || \'\';');
            lines.push('    // If body is base64 string, convert to Buffer');
            lines.push('    const binaryData = typeof body === \'string\' ? Buffer.from(body, \'base64\') : body;');
            lines.push('    ');
            lines.push('    // Build request options');
            lines.push('    const requestOptions: any = { headers, data: binaryData };');
            lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
            lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
            lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
            lines.push('    ');
            lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
        } else if (bodyType === 'graphql') {
            // GraphQL body: format as {query, variables, operationName}
            lines.push('    // Build GraphQL request body');
            const query = (request.body as any).query || '';
            const variables = (request.body as any).variables || '{}';
            lines.push('    const defaultBody = {');
            lines.push(`        query: ${JSON.stringify(query)},`);
            lines.push(`        variables: ${variables},`);
            lines.push('    };');
            lines.push('    const body = options.body ? { ...defaultBody, ...options.body } : defaultBody;');
            lines.push('    body.query = env.resolve(body.query || \'\');');
            lines.push('    ');
            lines.push('    // Build request options');
            lines.push('    const requestOptions: any = { headers, data: body };');
            lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
            lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
            lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
            lines.push('    ');
            lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
        } else {
            // Fallback for unknown body types
            lines.push(`    // Unsupported body type: ${bodyType} - using data option`);
            lines.push('    // Build request body');
            lines.push(`    const defaultBody = ${JSON.stringify(request.body, null, 8).split('\n').join('\n    ')};`);
            lines.push('    const body = options.body ? { ...defaultBody, ...options.body } : defaultBody;');
            lines.push('    const resolvedBody = env.resolveObject(body);');
            lines.push('    ');
            lines.push('    // Build request options');
            lines.push('    const requestOptions: any = { headers, data: resolvedBody };');
            lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
            lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
            lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
            lines.push('    ');
            lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
        }
    } else {
        lines.push('    // Build request options');
        lines.push('    const requestOptions: any = { headers };');
        lines.push('    if (options.maxRedirects !== undefined) requestOptions.maxRedirects = options.maxRedirects;');
        lines.push('    if (options.timeout !== undefined) requestOptions.timeout = options.timeout;');
        lines.push('    if (options.failOnStatusCode !== undefined) requestOptions.failOnStatusCode = options.failOnStatusCode;');
        lines.push('    ');
        lines.push(`    return request.${request.method.toLowerCase()}(url, requestOptions);`);
    }
    
    lines.push('}');
    
    return lines.join('\n');
}

/**
 * Folder structure node
 */
interface FolderNode {
    files: string[];
    subfolders: Map<string, FolderNode>;
}

/**
 * Build folder structure from request paths
 */
function buildFolderStructure(requests: RequestInfo[]): FolderNode {
    const root: FolderNode = { files: [], subfolders: new Map() };
    
    for (const request of requests) {
        const parts = request.path.split('/');
        let current = root;
        
        // Navigate/create folder structure
        for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            if (!current.subfolders.has(folderName)) {
                current.subfolders.set(folderName, { files: [], subfolders: new Map() });
            }
            current = current.subfolders.get(folderName)!;
        }
        
        // Add file to the final folder
        current.files.push(request.name);
    }
    
    return root;
}

/**
 * Generate index files recursively for folder structure
 */
function generateIndexFilesRecursively(
    baseDir: string,
    node: FolderNode,
    folderName: string,
    relativePath: string = ''
): void {
    const lines: string[] = [];
    
    lines.push('/**');
    lines.push(` * ${folderName} - API Client`);
    lines.push(' * ');
    lines.push(' * @generated by @http-forge/codegen');
    lines.push(' */');
    lines.push('');
    
    // Export all files in this folder
    for (const fileName of node.files) {
        const funcName = toCamelCase(fileName);
        lines.push(`export { ${funcName} } from './${fileName}';`);
    }
    
    // Export subfolders as namespace objects
    if (node.subfolders.size > 0) {
        if (node.files.length > 0) {
            lines.push('');
        }
        for (const [subfolderName, subfolderNode] of node.subfolders) {
            const namespaceName = toCamelCase(subfolderName);
            lines.push(`export * as ${namespaceName} from './${subfolderName}';`);
            
            // Recursively generate index for subfolder
            const subfolderPath = path.join(relativePath, subfolderName);
            generateIndexFilesRecursively(baseDir, subfolderNode, subfolderName, subfolderPath);
        }
    }
    
    // Write index file
    const indexPath = path.join(baseDir, relativePath, 'index.ts');
    fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
    log(`Generated: ${indexPath}`);
}

/**
 * Generate barrel (index.ts) files recursively for all folders
 */
function generateBarrelFiles(outputDir: string, collection: CollectionInfo): void {
    // Build folder structure from request paths
    const folderStructure = buildFolderStructure(collection.requests);
    
    // Generate index files recursively
    generateIndexFilesRecursively(outputDir, folderStructure, collection.name);
}

/**
 * Generate root barrel file for all collections
 */
function generateRootBarrel(collections: CollectionInfo[]): string {
    const lines: string[] = [];
    
    lines.push('/**');
    lines.push(' * HTTP Forge API Clients');
    lines.push(' * ');
    lines.push(' * @generated by @http-forge/codegen');
    lines.push(' */');
    lines.push('');
    
    for (const collection of collections) {
        const name = toCamelCase(collection.name);
        lines.push(`export * as ${name} from './${collection.name}';`);
    }
    
    return lines.join('\n');
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Generate typed API clients from collections
 */
export async function generateClients(options: GeneratorOptions): Promise<void> {
    const { input, output, overwrite = false } = options;
    
    log(`Parsing collections from: ${input}`);
    
    // Check if input is a single collection or a directory of collections
    const pattern = path.join(input, '**/request.json').replace(/\\/g, '/');
    const hasRequests = (await glob(pattern)).length > 0;
    
    let collections: CollectionInfo[];
    
    if (hasRequests && fs.existsSync(path.join(input, 'collection.json'))) {
        // Input is a single collection directory
        log('Detected single collection');
        const collection = await parseCollection(input);
        collections = [collection];
        log(`Found 1 collection:`);
        log(`  - ${collection.name} (${collection.requests.length} requests)`);
    } else if (hasRequests) {
        // Input is a single collection directory (no collection.json)
        log('Detected single collection (no collection.json)');
        const collection = await parseCollection(input);
        collections = [collection];
        log(`Found 1 collection:`);
        log(`  - ${collection.name} (${collection.requests.length} requests)`);
    } else {
        // Input is a directory of collections
        collections = await parseCollections(input);
        log(`Found ${collections.length} collections:`);
        for (const collection of collections) {
            log(`  - ${collection.name} (${collection.requests.length} requests)`);
        }
    }
    
    // Generate files for each collection
    for (const collection of collections) {
        ensureDir(output);
        
        // Generate request files (preserve folder structure from collection)
        for (const request of collection.requests) {
            // request.path is like 'collection/folder/request', use dirname to get parent folder
            const requestParentDir = path.dirname(request.path);
            const outputDir = path.join(output, requestParentDir);
            ensureDir(outputDir);
            
            const filePath = path.join(outputDir, `${request.name}.ts`);
            
            if (!overwrite && fs.existsSync(filePath)) {
                log(`  Skipping ${filePath} (exists)`);
                continue;
            }
            
            const content = generateRequestFile(request, collection.name);
            fs.writeFileSync(filePath, content, 'utf-8');
            log(`  Generated: ${filePath}`);
        }
        
        // Generate collection barrel files recursively
        generateBarrelFiles(output, collection);
    }
    
    log('\nDone! Generated files in:', output);
}

/**
 * Generate a single request file
 */
export async function generateSingleRequest(options: SingleRequestOptions): Promise<void> {
    const { input, output, request: requestPath, overwrite = false, updateBarrel = true } = options;
    
    // Parse request path: "collection-name/request-name" or "collection-name/folder/request-name"
    const parts = requestPath.split('/');
    if (parts.length < 2) {
        throw new Error(`Invalid request path: ${requestPath}. Expected format: collection/request or collection/folder/request`);
    }
    
    const collectionName = parts[0];
    const collectionPath = path.join(input, collectionName);
    
    if (!fs.existsSync(collectionPath)) {
        throw new Error(`Collection not found: ${collectionPath}`);
    }
    
    // Build the request folder path
    const requestFolderPath = path.join(input, requestPath);
    const requestJsonPath = path.join(requestFolderPath, 'request.json');
    
    if (!fs.existsSync(requestJsonPath)) {
        throw new Error(`Request not found: ${requestJsonPath}`);
    }
    
    log(`Parsing request: ${requestPath}`);
    const request = parseRequest(requestJsonPath, collectionPath);
    
    if (!request) {
        throw new Error(`Failed to parse request: ${requestPath}`);
    }
    
    // Generate the request file (flat structure: collection/request-name.ts)
    const collectionDir = path.join(output, collectionName);
    ensureDir(collectionDir);
    
    const filePath = path.join(collectionDir, `${request.name}.ts`);
    
    if (!overwrite && fs.existsSync(filePath)) {
        log(`File exists: ${filePath}. Use --overwrite to replace.`);
        return;
    }
    
    const content = generateRequestFile(request, collectionName);
    fs.writeFileSync(filePath, content, 'utf-8');
    log(`Generated: ${filePath}`);
    
    // Update barrel file if requested
    if (updateBarrel) {
        await updateCollectionBarrel(input, output, collectionName);
    }
    
    log('\nDone!');
}

/**
 * Generate a single collection
 */
export async function generateCollection(options: CollectionOptions): Promise<void> {
    const { input, output, collection: collectionName, overwrite = false, updateBarrel = true } = options;
    
    const collectionPath = path.join(input, collectionName);
    
    if (!fs.existsSync(collectionPath)) {
        throw new Error(`Collection not found: ${collectionPath}`);
    }
    
    log(`Parsing collection: ${collectionName}`);
    const collection = await parseCollection(collectionPath);
    
    log(`Found ${collection.requests.length} requests`);
    
    const collectionDir = path.join(output, collectionName);
    ensureDir(collectionDir);
    
    // Generate request files (preserve folder structure from collection)
    for (const request of collection.requests) {
        // request.path is relative to collection, use dirname to get parent folder
        const requestParentDir = path.dirname(request.path);
        const outputDir = path.join(collectionDir, requestParentDir);
        ensureDir(outputDir);
        
        const filePath = path.join(outputDir, `${request.name}.ts`);
        
        if (!overwrite && fs.existsSync(filePath)) {
            log(`  Skipping ${filePath} (exists)`);
            continue;
        }
        
        const content = generateRequestFile(request, collectionName);
        fs.writeFileSync(filePath, content, 'utf-8');
        log(`  Generated: ${filePath}`);
    }
    
    // Generate collection barrel files recursively
    generateBarrelFiles(collectionDir, collection);
    
    // Update root barrel if requested
    if (updateBarrel) {
        await updateRootBarrel(input, output);
    }
    
    log('\nDone!');
}

/**
 * Update collection barrel file with current requests
 */
async function updateCollectionBarrel(input: string, output: string, collectionName: string): Promise<void> {
    const collectionPath = path.join(input, collectionName);
    const collection = await parseCollection(collectionPath);
    
    const collectionDir = path.join(output, collectionName);
    ensureDir(collectionDir);
    
    generateBarrelFiles(collectionDir, collection);
    log(`Updated barrel files for: ${collectionName}`);
}

/**
 * Update root barrel file with current collections
 */
async function updateRootBarrel(input: string, output: string): Promise<void> {
    const collections = await parseCollections(input);
    
    const rootBarrelPath = path.join(output, 'index.ts');
    const rootBarrelContent = generateRootBarrel(collections);
    
    ensureDir(path.dirname(rootBarrelPath));
    fs.writeFileSync(rootBarrelPath, rootBarrelContent, 'utf-8');
    log(`Updated root barrel: ${rootBarrelPath}`);
}
