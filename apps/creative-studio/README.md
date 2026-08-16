# TIH Creative Studio

Creative Studio turns live TIH evidence into reviewable, on-brand ad variations without allowing models to invent commercial facts.

## Workflow

1. Read the approved brand tokens and claim rules.
2. Pull current products, prices, inventory and paid-order signals from Shopify.
3. Optionally add search and intent signals from DataForSEO.
4. Use this ChatGPT/Codex task to rank distinct, source-cited angles and approve the slate.
5. Use Gemini to generate or adapt visual concepts while preserving the selected rug.
6. Validate claims, availability, dimensions, copy limits and source citations.
7. Emit a Canva handoff dataset for feed and story production.
8. Present a review queue; exporting or publishing always requires human approval.

## Provider responsibilities

- **Shopify:** commercial source of truth.
- **DataForSEO:** external demand and competitor research.
- **ChatGPT/Codex:** angle strategy, copy, critique and approval orchestration.
- **Gemini:** product-grounded visual generation and image variation.
- **Canva:** editable master templates, brand consistency and final production.

Model outputs pass through shared Zod schemas so providers can be compared or replaced without changing the rest of the system.

## Commands

Run from this directory:

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm preflight
pnpm evidence -- --product=maleny-beige-jute-rug
pnpm research -- --keywords="jute rugs,wool rugs" --limit=25
pnpm generate -- --product=maleny-beige-jute-rug --count=6
pnpm render -- --batch=/absolute/path/to/batch.json --concept=concept-01
```

`preflight` validates the brand file and live Gemini/DataForSEO connections without exposing credentials. `evidence` creates a Shopify-paid-order-grounded JSON pack and a ChatGPT brief. `research` calls a billable DataForSEO live endpoint and is never run automatically. `generate` remains blocked until the required customer-review corpus is populated. `render` uses the selected Shopify product image as an immutable Gemini reference and saves an image without baked-in copy for Canva.

## Environment

The ignored repository-root `.env` supplies:

```text
GEMINI or GEMINI_API_KEY
DATAFORSEO or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
OPENAI_API_KEY (optional)
```

Shopify configuration and OAuth session handling remain owned by `apps/shopify-ops/`. Secrets must never be sent to Canva, model prompts, logs or generated artifacts.

## Grounding folders

The toolkit maintains source records for winning ads, reviews, ad comments, external search and performance evidence. Every generated concept identifies its evidence and distinguishes observed facts from model hypotheses.

## Canva boundary

The installed Canva connector can generate and edit individual designs. Brand-template discovery and autofill currently return a paid-plan requirement, so automated one-design-per-row production is unavailable on this Canva account. Generated batches still include `canva-handoff.json`; once autofill is enabled, map its five fields to an approved Canva brand template.
