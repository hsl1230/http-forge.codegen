# @http-forge/codegen

Generate typed TypeScript API clients from HTTP Forge collections.

## Features

- 🔧 CLI tool for generating TypeScript clients from HTTP Forge collections
- 📝 Type-safe interfaces for headers, query params, path params, and request bodies
- 📐 **Schema-first generation** — uses `body.schema.json` and `response.schema.json` when available
- 🏷️ **Typed response wrappers** — generates `TypedAPIResponse` with `json(): Promise<ResponseType>` from response schemas
- 🔤 **Typed parameters** — rich metadata (type, required, enum, format, description, deprecated) for headers, query, and path params
- 🔗 **Path param constraint detection** — enum constraints become union types, regex patterns become `string` with `@pattern` JSDoc
- 🔄 `{{variable}}` resolution in generated request payloads
- 📦 Barrel export generation with recursive `index.ts` files
- 🎯 Generate all collections, a single collection, or a single request
- ⚙️ Optional type-only generation for schema-first workflows
- 📋 Supports JSON, form-urlencoded, form-data (with file uploads), GraphQL, binary, and raw text body types

## Installation

```bash
npm install @http-forge/codegen
```

## Quick Start

### CLI usage

```bash
# Generate all collections
npx http-forge-codegen --input ./collections --output ./api-clients

# Generate a single collection
npx http-forge-codegen -i ./collections -o ./api-clients -c forgerock-login

# Generate a single request
npx http-forge-codegen -i ./collections -o ./api-clients -r forgerock-login/login-request

# Overwrite existing generated files
npx http-forge-codegen -i ./collections -o ./api-clients --overwrite

# Generate only type definitions
npx http-forge-codegen -i ./collections -o ./api-clients --types-only

# Skip barrel file updates for single request/collection generation
npx http-forge-codegen -i ./collections -o ./api-clients -r forgerock-login/login-request --no-barrel
```

### CLI options

| Flag | Description |
|------|-------------|
| `-i, --input <path>` | Input directory containing collection source files (required) |
| `-o, --output <path>` | Output directory for generated files (required) |
| `-r, --request <path>` | Generate a single request by path (e.g., `collection/request`) |
| `-c, --collection <name>` | Generate a single collection |
| `--overwrite` | Overwrite existing files (default: `false`) |
| `--types-only` | Generate only TypeScript types without runtime request functions |
| `--no-barrel` | Skip `index.ts` barrel file generation |

### Programmatic usage

```ts
import { generateClients, generateCollection, generateSingleRequest } from '@http-forge/codegen';

// Generate all collections
await generateClients({
  input: './collections',
  output: './api-clients',
  overwrite: true,
});

// Generate a single collection
await generateCollection({
  input: './collections',
  output: './api-clients',
  collection: 'forgerock-login',
});

// Generate a single request
await generateSingleRequest({
  input: './collections',
  output: './api-clients',
  request: 'forgerock-login/login-request',
  updateBarrel: false,
});
```

### Programmatic option types

| Function | Options Type |
|----------|-------------|
| `generateClients(options)` | `GeneratorOptions` |
| `generateCollection(options)` | `CollectionOptions` |
| `generateSingleRequest(options)` | `SingleRequestOptions` |

Common option fields:

| Field | Type | Description |
|-------|------|-------------|
| `input` | `string` | Collection source directory |
| `output` | `string` | Generated output directory |
| `overwrite?` | `boolean` | Whether to overwrite existing files |
| `typesOnly?` | `boolean` | Emit only type definitions |
| `updateBarrel?` | `boolean` | Update barrel exports after generating a single collection or request |

## Collection structure

The codegen reads HTTP Forge collection folders. Each request is a directory containing:

```text
collections/
└── my-api/
    └── get-user/
        ├── request.json         # Method, URL, headers, query params, path params
        ├── body.json            # Request body (optional, overrides inline body)
        ├── body.schema.json     # JSON Schema for request body (optional)
        └── response.schema.json # Response schemas per status code (optional)
```

### Schema files

**`body.schema.json`** — When present, the codegen generates the request body interface from this JSON Schema instead of inferring types from `body.json` sample data. Supports `$ref`, `oneOf`/`anyOf`/`allOf`, nested objects, and `components` for shared definitions.

**`response.schema.json`** — Defines response types per HTTP status code. Generates per-status interfaces (e.g., `Response200`, `Response404`) and a typed response wrapper with `json(): Promise<PrimaryResponseType>`.

```json
{
  "responses": {
    "200": {
      "description": "Success",
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" }
            },
            "required": ["id"]
          }
        }
      }
    }
  }
}
```

## Generated output

### File structure

```text
api-clients/
├── forgerock-login/
│   ├── login-request.ts
│   ├── form-submission.ts
│   ├── user-sessions.ts
│   └── index.ts
├── user-api/
│   └── ...
└── index.ts
```

### Generated code example

Each request file contains typed interfaces and an async function:

```ts
import type { HttpHeaders, BaseRequestContext, BaseApiOptions } from '@http-forge/playwright';
import type { APIResponse } from '@playwright/test';

// Headers interface (typed metadata when available)
export interface GetUserHeaders extends HttpHeaders {
    /** Authorization token — @default "Bearer {{accessToken}}" */
    'Authorization'?: string;
}

// Path params interface with constraint-based types
export interface GetUserPathParams {
    /** Path parameter: contentType */
    contentType: 'VOD' | 'PROGRAM';          // enum constraint → union type
    /** Path parameter: appversion — @pattern T7.[0-9] */
    appversion: string;                       // regex constraint → string
    userId: any;                              // no constraint → any
}

// Query params interface (typed metadata when available)
export interface GetUserQuery {
    /** Filter by status — @format enum */
    status?: 'active' | 'inactive';
    /** Page number */
    page?: number;
    [key: string]: any;
}

// Body interface (from body.schema.json when available)
export interface GetUserBody {
    name: string;
    email?: string;
}

// Response interface (from response.schema.json)
/** Success */
export interface GetUserResponse200 {
    id: string;
    name?: string;
}

// Typed response wrapper
export interface GetUserTypedResponse extends APIResponse {
    json(): Promise<GetUserResponse200>;
}

// Options interface
export interface GetUserOptions extends BaseRequestContext<GetUserHeaders>, BaseApiOptions {
    params: GetUserPathParams;
    query?: GetUserQuery;
    body?: GetUserBody;
}

// Async request function
export async function getUser(options: GetUserOptions): Promise<GetUserTypedResponse> {
    // ... URL resolution, header merging, Playwright request
}
```

### Type generation priority

| Source | Priority | Description |
|--------|----------|-------------|
| `body.schema.json` | Highest | JSON Schema → full interface with required/optional, JSDoc, nested types |
| `body.json` | Fallback | Sample data → inferred interface with `any` types and `@default` comments |
| Inline body in `request.json` | Lowest | Same as `body.json` |

### Path parameter constraints

Path params extracted from URL patterns like `:name(constraint)?` are turned into TypeScript types:

| URL pattern | Constraint | Generated type |
|-------------|-----------|----------------|
| `:contentType(VOD\|PROGRAM)` | `VOD\|PROGRAM` | `'VOD' \| 'PROGRAM'` |
| `:provider(TELUS)` | `TELUS` | `'TELUS'` |
| `:appversion(T7.[0-9])` | `T7.[0-9]` | `string` (with `@pattern` JSDoc) |
| `:userId` | none | `any` |
| `:sessionId?` | none | `any` (optional) |

### Body type support

| Body type | Generated interface | Runtime handling |
|-----------|-------------------|-----------------|
| `json` / `raw` (json format) | Object interface or schema | `data:` with `env.resolveObject()` |
| `x-www-form-urlencoded` | Interface from field array | `form:` |
| `form-data` | Interface from field array | `multipart:` (files) or `form:` (text) |
| `graphql` | `{ query, variables, operationName }` | Merges defaults, resolves query |
| `binary` | `Buffer \| string` | Base64 → Buffer conversion |
| `raw` (text/xml/html/js) | `string` type alias | `data:` with `env.resolve()` |

## Exported types

The package exports the following types for programmatic use:

```ts
import type {
  GeneratorOptions,
  SingleRequestOptions,
  CollectionOptions,
  CollectionInfo,
  RequestInfo,
  TypedParam,
} from '@http-forge/codegen';
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
