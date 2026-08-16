# Repository Guidelines

## Project Structure & Module Organization

This repository combines TIH marketing deliverables and internal tools.

- `creative-assets/<brand>/<month-year>/references/` stores source photography.
- `final/` contains lossless PNG masters; `meta-upload/` contains delivery-ready JPEGs.
- Keep manifests, launch logs, and dated reports beside each creative batch.
- `apps/shopify-ops/` contains the Next.js/Vercel OAuth gateway and TypeScript MCP server. Routes live in `app/`, shared code in `src/`, and tests in `tests/`.
- `apps/creative-studio/` contains grounded creative research and generation. Provider clients live in `src/providers/`, orchestration in `src/services/`, and tests in `tests/`.
- `brand/the-inspire-home/` is the canonical brand and claims source.

Keep campaign batches self-contained and never overwrite source references.

## Build, Test, and Development Commands

Run application commands from `apps/shopify-ops/`:

```sh
pnpm install       # install dependencies
pnpm test          # run tests
pnpm typecheck     # check TypeScript
pnpm build         # build MCP and web app
pnpm dev:web       # run OAuth app locally
pnpm sync-token    # sync the remote session locally
pnpm start:mcp     # start the MCP server
```

Run creative-system commands from `apps/creative-studio/`:

```sh
pnpm preflight                         # validate services and inputs
pnpm evidence -- --product=<handle>    # prepare Shopify evidence
pnpm test                              # run tests
pnpm typecheck                         # check TypeScript
```

For creative QA, use `file final/*` and `sips -g pixelWidth -g pixelHeight final/*.png`. Run `git diff --check` before committing.

## Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, explicit return types, and Zod at external boundaries. Use kebab-case files and camelCase functions. MCP tools follow `shopify_<action>_<resource>` and declare accurate safety annotations.

Write Markdown in UTF-8 with sentence-case headings and Australian spelling. Creative names use zero-padded kebab case, for example `04-maleny-jute.png`; reports use ISO dates.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name tests `*.test.ts`. Cover OAuth validation, token storage, GraphQL classification, pagination, and mutation safeguards. Production write tests require an explicit, reversible resource.

## Commit & Pull Request Guidelines

Use imperative commits such as `Add Shopify OAuth gateway`. Pull requests should describe impact and validation, link the brief or issue, and preview visual changes.

## Security & Configuration

Never commit `.env`, `.env.local`, OAuth tokens, cookies, customer exports, or `.data/`. Keep Vercel secrets server-side and encrypt remote sessions at rest. Logs may include Shopify resource IDs and operation hashes, but never secrets, customer details, or mutation variable values.
