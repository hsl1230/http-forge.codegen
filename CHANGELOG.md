# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-04-07

### Fixed
- **`@pattern` JSDoc for typed path params** — when typed path param enum values contain regex metacharacters, the generated JSDoc now includes `@pattern` with the constraint from the URL (or joined enum values as fallback). Previously `@pattern` was only emitted in the non-typed code path.

## [0.1.5] - 2026-04-07

### Fixed
- **Regex detection in typed param enums** — `typedParamToTS` now checks enum values for regex metacharacters (`. [ ] * + ? \ ^ $ { } ( )`). Enum values like `T7.[0-9]` are no longer emitted as string literal types; instead the parameter falls back to `string`. Only plain alphanumeric enum values (e.g., `VOD`, `PROGRAM`) produce union literal types.

## [0.1.4] - 2026-04-07

### Added
- **Schema-based body generation** — when `body.schema.json` exists, generates the request body interface from JSON Schema instead of inferring from sample data. Supports `$ref`, `oneOf`/`anyOf`/`allOf`, nested objects, and `components`.
- **Response type generation** — reads `response.schema.json` and generates per-status-code interfaces (e.g., `Response200`, `Response404`).
- **`TypedAPIResponse` wrapper** — generates `{Name}TypedResponse extends APIResponse { json(): Promise<ResponseType> }` when response schema is available, used as the function return type.
- **Typed parameter metadata** — `TypedParam` interface with `type`, `required`, `enum`, `format`, `description`, and `deprecated` fields for headers, query params, and path params.
- **Typed headers interface** — generates headers from rich metadata when available (`typedHeaders`).
- **Typed query interface** — generates query params with proper TypeScript types, required/optional markers, and JSDoc from metadata.
- **Typed path params** — uses `typedPathParams` metadata from `request.json` `params` field when available.
- **Regex constraint detection** — path param constraints containing regex metacharacters (e.g., `T7.[0-9]`) generate `string` type with `@pattern` JSDoc instead of string literal types. Simple alternations (e.g., `VOD|PROGRAM`) still generate union types.
- **JSON Schema → TypeScript conversion** — full conversion pipeline supporting all JSON Schema types, `$ref` resolution, `enum`, `oneOf`/`anyOf`/`allOf`, nested objects with JSDoc (`@format`, `@example`, `@deprecated`).
- Exported `TypedParam`, `CollectionInfo`, and `parseCollection`/`parseRequest` from public API.

### Fixed
- **Body config vs data** — raw body types (`text`, `xml`, `html`, `javascript`) no longer include config metadata (format, content fields) as body data.
- **`shouldIncludeBody` logic** — correctly includes body when only `bodySchema` is present (no sample data).

### Changed
- Updated README with comprehensive documentation of all features, schema files, generated code examples, type generation priority, constraint handling, and body type support.

## [0.1.2] - 2026-04-06

### Added
- New `CHANGELOG.md` documenting release history and project updates.
- Updated README with accurate CLI usage, programmatic API examples, and option descriptions.
- Clarified generated output structure and command-line flags.

### Fixed
- Removed outdated `@http-forge/codegen/env` usage from documentation.
- Aligned README examples with actual exported functions and CLI options.
