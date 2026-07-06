# @http-forge/codegen

[![npm version](https://img.shields.io/npm/v/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)
[![npm downloads](https://img.shields.io/npm/dm/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)
[![license](https://img.shields.io/npm/l/%40http-forge%2Fcodegen)](LICENSE)
[![node](https://img.shields.io/node/v/%40http-forge%2Fcodegen)](https://www.npmjs.com/package/@http-forge/codegen)

**Generate typed TypeScript API clients from HTTP Forge collections.**

Turn your HTTP Forge workspace requests into fully-typed, Playwright-ready API client functions — with schema-first types, path param constraints, and barrel exports.

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

## How It Fits In The HTTP Forge Family

| Component | Role |
|---|---|
| HTTP Forge VS Code extension | Build and validate requests/collections in workspace |
| `@http-forge/core` | Shared execution and Postman-compatible runtime behavior |
| `@http-forge/codegen` | Generates typed TypeScript API client functions from your workspace |
| `@http-forge/playwright` | Runtime + shared types used by generated Playwright clients |
| HTTP Forge CLI | Headless collection/suite runs and reporting for CI/CD |

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

# Optional: use via HTTP Forge CLI (single global entry point)
npm install --global @http-forge/cli
```

### Use Through HTTP Forge CLI

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

## License

MIT
