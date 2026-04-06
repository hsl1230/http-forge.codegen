# @http-forge/codegen

Generate typed TypeScript API clients from HTTP Forge collections.

## Features

- 🔧 CLI tool for generating TypeScript clients from HTTP Forge collections
- 📝 Type-safe request types, headers, query params, and bodies
- 🔄 `{{variable}}` variable resolution in generated request payloads
- 📦 Barrel export generation with `index.ts` files
- 🎯 Support for full generation, single collection, or single request
- ⚙️ Optional type-only generation for schema-first workflows

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

- `-i, --input <path>`: input directory containing collection source files
- `-o, --output <path>`: output directory for generated files
- `-r, --request <path>`: generate a single request by path
- `-c, --collection <name>`: generate a single collection
- `--overwrite`: overwrite existing files
- `--types-only`: generate only TypeScript types without runtime request wrappers
- `--no-barrel`: skip generated `index.ts` barrel files for single request/collection generation

### Programmatic usage

```ts
import { generateClients, generateCollection, generateSingleRequest } from '@http-forge/codegen';

await generateClients({
  input: './collections',
  output: './api-clients',
  overwrite: true,
});

await generateCollection({
  input: './collections',
  output: './api-clients',
  collection: 'forgerock-login',
});

await generateSingleRequest({
  input: './collections',
  output: './api-clients',
  request: 'forgerock-login/login-request',
  updateBarrel: false,
});
```

### Programmatic option types

- `generateClients(options: GeneratorOptions)`
- `generateCollection(options: CollectionOptions)`
- `generateSingleRequest(options: SingleRequestOptions)`

Common option fields:

- `input`: collection source directory
- `output`: generated output directory
- `overwrite?`: whether to overwrite existing files
- `typesOnly?`: emit only type definitions
- `updateBarrel?`: update barrel exports after generating a single collection or request

## Generated output structure

```text
api-clients/
├── forgerock-login/
│   ├── login-request/
│   │   └── request.ts
│   ├── form-submission/
│   │   └── request.ts
│   ├── user-sessions/
│   │   └── request.ts
│   └── index.ts
├── user-api/
│   └── ...
└── index.ts
```

## Development

```bash
npm install
npm run build
npm test
```

## Notes

- The CLI is published as `http-forge-codegen` and can be run with `npx`.
- Generated clients are written to the `output` directory and can include barrel exports when enabled.

## License

MIT
