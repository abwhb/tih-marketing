# Repository Guidelines

## Project Structure & Module Organization

This repository combines TIH marketing deliverables with internal marketing tooling.

- `creative-assets/<brand>/<month-year>/references/` stores source photography.
- `final/` contains lossless PNG masters; `meta-upload/` contains delivery-ready JPEGs.
- Campaign manifests, launch logs, and dated reports live beside each creative batch.
- `apps/shopify-ops/` contains the Next.js/Vercel OAuth gateway and local TypeScript MCP server. Routes live in `app/`, shared code in `src/`, and tests in `tests/`; generated output and `.data/` are ignored.

Keep campaign batches self-contained and never overwrite source references.

## Build, Test, and Development Commands

Run application commands from `apps/shopify-ops/`:

```sh
pnpm install       # install locked dependencies
pnpm test          # run Node test suites through tsx
pnpm typecheck     # check strict TypeScript without emitting files
pnpm build         # compile MCP output and the Vercel web application
pnpm dev:web       # run the OAuth web application locally
pnpm sync-token    # copy the authorised remote session into local storage
pnpm start:mcp     # start the compiled stdio MCP server
```

For creative QA, use `file final/*` and `sips -g pixelWidth -g pixelHeight final/*.png`. Run `git diff --check` before committing.

## Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, explicit return types, and Zod validation at external boundaries. Name files and functions in lowercase kebab case and camelCase respectively. MCP tools use the `shopify_<action>_<resource>` pattern and include accurate read-only/destructive annotations.

Write Markdown in UTF-8 with sentence-case headings and Australian spelling. Creative names use zero-padded kebab case, for example `04-maleny-jute.png`; reports use ISO dates.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name tests `*.test.ts`. Cover OAuth signature/state validation, token persistence, GraphQL operation classification, pagination, and mutation safeguards. Never run write integration tests against production without an explicit, reversible test resource.

## Commit & Pull Request Guidelines

Use concise imperative commits such as `Add Shopify OAuth gateway` or `Refresh Maleny upload asset`. Pull requests should describe user impact, list validation performed, link the relevant brief or issue, and include previews for visual changes.

## Security & Configuration

Never commit `.env`, `.env.local`, OAuth tokens, cookies, customer exports, or `.data/`. Keep Vercel secrets server-side and encrypt remote sessions at rest. Logs may include Shopify resource IDs and operation hashes, but never secrets, customer details, or mutation variable values.
