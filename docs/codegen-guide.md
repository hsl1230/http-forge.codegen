# @http-forge/codegen — Full Guide

## Integration With HTTP Forge Family

| Component | Role |
|---|---|
| HTTP Forge VS Code extension | Build and validate requests/collections in workspace |
| `@http-forge/core` | Shared execution and Postman-compatible runtime behavior |
| `@http-forge/codegen` | Generates typed TypeScript API client functions from your workspace |
| `@http-forge/playwright` | Runtime + shared types used by generated Playwright clients |
| HTTP Forge CLI | Headless collection/suite runs and reporting for CI/CD |

### End-to-End Workflow

1. Author and validate requests in the HTTP Forge VS Code extension.
2. Commit the workspace (collections + environments) to Git.
3. Generate typed client functions using either:
    - `npx http-forge-codegen --input ./collections --output ./api-clients`, or
    - `http-forge generate --input ./collections --output ./api-clients` (through `@http-forge/cli`).
4. Import generated clients into Playwright tests, backed by `@http-forge/playwright` runtime.
5. Execute via `@playwright/test` locally or through HTTP Forge CLI in CI/CD.

### What @http-forge/codegen Produces

Generated clients depend on `@http-forge/playwright` for runtime behavior and shared types. They accept a `ForgeEnv` instance for variable resolution and a Playwright `APIRequestContext` for execution:

```ts
// Generated file example
import type { HttpHeaders, BaseRequestContext, BaseApiOptions } from '@http-forge/playwright';
import type { APIResponse } from '@playwright/test';

export interface GetUserOptions extends BaseRequestContext<GetUserHeaders>, BaseApiOptions {
    params: GetUserPathParams;
    query?: GetUserQuery;
    body?: GetUserBody;
}

export async function getUser(options: GetUserOptions): Promise<GetUserTypedResponse> {
    const { request, env } = options;
    const url = env.buildUrl('{{baseUrl}}/users/:userId', { params: options.params });
    return request.get(url) as Promise<GetUserTypedResponse>;
}
```

---

## CLI Reference

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

### Generate Via HTTP Forge CLI

```bash
http-forge generate --input ./collections --output ./api-clients
http-forge generate --input ./collections --output ./api-clients --collection forgerock-login
http-forge generate --input ./collections --output ./api-clients --request forgerock-login/login-request
http-forge generate --input ./collections --output ./api-clients --overwrite --types-only
```

### Migration from http-forge-codegen

`http-forge-codegen` is still available as a legacy alias, but `http-forge generate` is the recommended command.

- `npx http-forge-codegen -i ./collections -o ./api-clients` → `http-forge generate -i ./collections -o ./api-clients`
- `npx http-forge-codegen -i ./collections -o ./api-clients -c forgerock-login` → `http-forge generate -i ./collections -o ./api-clients -c forgerock-login`
- `npx http-forge-codegen -i ./collections -o ./api-clients -r forgerock-login/login-request` → `http-forge generate -i ./collections -o ./api-clients -r forgerock-login/login-request`

### CLI Options

| Flag | Description |
|---|---|
| `-i, --input <path>` | Input directory containing collection source files (required) |
| `-o, --output <path>` | Output directory for generated files (required) |
| `-r, --request <path>` | Generate a single request by path (e.g., `collection/request`) |
| `-c, --collection <name>` | Generate a single collection |
| `--overwrite` | Overwrite existing files (default: `false`) |
| `--types-only` | Generate only TypeScript types without runtime request functions |
| `--no-barrel` | Skip `index.ts` barrel file generation |

---

## Programmatic Usage

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

### Option Types

| Function | Options Type |
|---|---|
| `generateClients(options)` | `GeneratorOptions` |
| `generateCollection(options)` | `CollectionOptions` |
| `generateSingleRequest(options)` | `SingleRequestOptions` |

| Field | Type | Description |
|---|---|---|
| `input` | `string` | Collection source directory |
| `output` | `string` | Generated output directory |
| `overwrite?` | `boolean` | Whether to overwrite existing files |
| `typesOnly?` | `boolean` | Emit only type definitions |
| `updateBarrel?` | `boolean` | Update barrel exports after generating a single collection or request |

---

## Collection Structure

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

### Schema Files

**`body.schema.json`** — When present, the codegen generates the request body interface from this JSON Schema instead of inferring types from `body.json`. Supports `$ref`, `oneOf`/`anyOf`/`allOf`, nested objects, and `components`.

**`response.schema.json`** — Defines response types per HTTP status code. Generates per-status interfaces (`Response200`, `Response404`) and a typed response wrapper with `json(): Promise<PrimaryResponseType>`.

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

---

## Generated Output

### File Structure

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

### Generated Code Example

```ts
import type { HttpHeaders, BaseRequestContext, BaseApiOptions } from '@http-forge/playwright';
import type { APIResponse } from '@playwright/test';

export interface GetUserHeaders extends HttpHeaders {
    /** Authorization token — @default "Bearer {{accessToken}}" */
    'Authorization'?: string;
}

export interface GetUserPathParams {
    contentType: 'VOD' | 'PROGRAM';      // enum constraint → union type
    appversion: string;                   // regex constraint → string (@pattern JSDoc)
    userId: any;                          // no constraint → any
}

export interface GetUserQuery {
    status?: 'active' | 'inactive';
    page?: number;
    [key: string]: any;
}

export interface GetUserBody {
    name: string;
    email?: string;
}

export interface GetUserResponse200 {
    id: string;
    name?: string;
}

export interface GetUserTypedResponse extends APIResponse {
    json(): Promise<GetUserResponse200>;
}

export interface GetUserOptions extends BaseRequestContext<GetUserHeaders>, BaseApiOptions {
    params: GetUserPathParams;
    query?: GetUserQuery;
    body?: GetUserBody;
}

export async function getUser(options: GetUserOptions): Promise<GetUserTypedResponse> {
    // URL resolution, header merging, Playwright request execution
}
```

### Type Generation Priority

| Source | Priority | Description |
|---|---|---|
| `body.schema.json` | Highest | JSON Schema → full interface with required/optional, JSDoc, nested types |
| `body.json` | Fallback | Sample data → inferred interface with `any` types and `@default` comments |
| Inline body in `request.json` | Lowest | Same as `body.json` |

### Path Parameter Constraints

Path params from URL patterns like `:name(constraint)?` are converted to TypeScript types. Any constraint containing regex metacharacters maps to `string` with `@pattern` JSDoc; plain values become union literal types.

| URL pattern | Constraint | Generated type |
|---|---|---|
| `:contentType(VOD\|PROGRAM)` | `VOD\|PROGRAM` | `'VOD' \| 'PROGRAM'` |
| `:provider(TELUS)` | `TELUS` | `'TELUS'` |
| `:appversion(T7.[0-9])` | `T7.[0-9]` | `string` (with `@pattern` JSDoc) |
| `:userId` | none | `any` |
| `:sessionId?` | none | `any` (optional) |

### Body Type Support

| Body type | Generated interface | Runtime handling |
|---|---|---|
| `json` / `raw` (JSON) | Object interface or schema | `data:` with `env.resolveObject()` |
| `x-www-form-urlencoded` | Interface from field array | `form:` |
| `form-data` | Interface from field array | `multipart:` (files) or `form:` (text) |
| `graphql` | `{ query, variables, operationName }` | Merges defaults, resolves query |
| `binary` | `Buffer \| string` | Base64 → Buffer conversion |
| `raw` (text/xml/html/js) | `string` type alias | `data:` with `env.resolve()` |

---

## Exported Types

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

---

## Development

```bash
npm install
npm run build
npm test
```
