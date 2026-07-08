<div align="center">

<a href="https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge">
<img src="https://raw.githubusercontent.com/hsl1230/http-forge/main/resources/http-forge-icon.png" alt="HTTP Forge" width="120"/>
</a>

</div>

# @http-forge/codegen

[![npm version](https://img.shields.io/npm/v/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)
[![npm downloads](https://img.shields.io/npm/dm/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/henry-huang.http-forge?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge)
[![license](https://img.shields.io/npm/l/%40http-forge%2Fcodegen)](LICENSE)
[![node](https://img.shields.io/node/v/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)

**Generate typed TypeScript API clients from HTTP Forge collections.**

Turn your HTTP Forge workspace requests into fully-typed, Playwright-ready API client functions with schema-first types, path param constraints, and barrel exports.

Built for HTTP Forge workflows from import to execution: bring in Postman/OpenAPI definitions, then generate production-ready TypeScript clients for tests and apps.

Want the full interactive [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge) experience? Use the VS Code extension: [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge).

## Who It Is For

- Teams who author requests in HTTP Forge and want typed Playwright tests.
- TypeScript developers who want contract-safe API client code without manual boilerplate.
- QA engineers who want to automate API tests generated directly from live request definitions.
- CI/CD pipelines that auto-regenerate clients when the API changes.

## Why @http-forge/codegen

- Go from collection → typed Playwright client in one command.
- Schema-first generation from `body.schema.json` and `response.schema.json`.
- Path param constraints become union types or `string` with `@pattern` JSDoc.
- Works alongside `@http-forge/playwright` runtime — generated clients depend on it.
- Generate all, one collection, or one request.

## Postman To Typed Client Workflow

Use HTTP Forge to convert existing Postman assets into typed client code quickly:
- Import Postman collection export with [HTTP Forge CLI](https://github.com/hsl1230/http-forge.cli#readme).
- Import Postman environment export.
- Run and validate imported APIs in HTTP Forge.
- Generate typed TypeScript clients with `@http-forge/codegen`.

```bash
# Import Postman collection and environment via CLI
http-forge import collection --postman ./MyApi.postman_collection.json
http-forge import env --postman ./MyEnv.postman_environment.json --env staging --overwrite

# Run imported collection
http-forge run collection "MyApi" --env staging --exit-code

# Generate typed clients from resulting workspace collections
npx http-forge-codegen --input ./collections --output ./api-clients
```

## How It Fits In The HTTP Forge Family

| Component | Role |
|---|---|
| HTTP Forge VS Code extension | Build and validate requests/collections in workspace |
| `@http-forge/core` | Shared execution and Postman-compatible runtime behavior |
| `@http-forge/codegen` | Generates typed TypeScript API client functions from your workspace |
| `@http-forge/playwright` | Runtime + shared types used by generated Playwright clients |
| [HTTP Forge CLI](https://github.com/hsl1230/http-forge.cli#readme) | Headless collection/suite runs and reporting for CI/CD |

`@http-forge/codegen` is the bridge between your HTTP Forge workspace and your Playwright test code. Generated clients import from `@http-forge/playwright` and work directly with the Playwright test runner.

## 1-Minute Quickstart

```bash
# 1) Install standalone codegen
npm install @http-forge/codegen

# 2) Generate all collections
npx http-forge-codegen --input ./collections --output ./api-clients

# Optional: one-command family workflow via CLI
# npm install --global @http-forge/cli
# http-forge generate --input ./collections --output ./api-clients

# 3) Use in Playwright tests
```

```ts
import { test, expect } from '@playwright/test';
import { ForgeEnv } from '@http-forge/playwright';
import { getUser } from './api-clients/user-api/get-user';

test('get user', async ({ request }) => {
    const env = ForgeEnv.create({ baseUrl: 'https://api.example.com' });
    const res = await getUser({ request, env, params: { userId: '123' } });
    expect(res.ok()).toBeTruthy();
});
```

## Core Commands

| Command | Purpose |
|---|---|
| `--input / -i` | Path to HTTP Forge collections folder |
| `--output / -o` | Output path for generated clients |
| `-c, --collection` | Generate a single collection only |
| `-r, --request` | Generate a single request only |
| `--overwrite` | Overwrite existing generated files |
| `--types-only` | Emit type definitions only, no runtime functions |
| `--no-barrel` | Skip `index.ts` barrel file generation |

## Installation

```bash
# Standalone package
npm install @http-forge/codegen

# Optional: use via CLI (single global entry point)
npm install --global @http-forge/cli
```

To manage requests visually, import from Postman/OpenAPI, and run suites with reporting, install the VS Code extension: [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge).

### Use Through [HTTP Forge CLI](https://github.com/hsl1230/http-forge.cli#readme)

If you prefer one global tool entry point, run code generation through CLI:

```bash
http-forge generate --input ./collections --output ./api-clients
http-forge generate --input ./collections --output ./api-clients --collection forgerock-login
http-forge generate --input ./collections --output ./api-clients --request forgerock-login/login-request
```

## Detailed Docs

- Full CLI reference and all options: [docs/codegen-guide.md](docs/codegen-guide.md)
- Integration guide across HTTP Forge family: [docs/codegen-guide.md#integration-with-http-forge-family](docs/codegen-guide.md#integration-with-http-forge-family)
- Migration from `http-forge-codegen` to `http-forge generate`: [docs/codegen-guide.md#migration-from-http-forge-codegen](docs/codegen-guide.md#migration-from-http-forge-codegen)
- Marketplace extension: [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge)

## License

MIT
