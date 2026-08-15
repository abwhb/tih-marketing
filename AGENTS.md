# Repository Guidelines

## Project Structure & Module Organization

This repository stores Meta advertising assets and campaign documentation; it does not contain application source code. Organize work under `creative-assets/<brand>/<month-year>/`. For the current The Inspire Home batch:

- `references/` contains source product and room photography.
- `final/` contains lossless master PNG creatives.
- `meta-upload/` contains delivery-ready JPEG exports.
- `creative-manifest.md` records copy, claims, destinations, and intended funnel use.
- `meta-launch-log.md` records published campaign and ad identifiers.
- Dated `meta-performance-report-YYYY-MM-DD.md` files capture results and recommendations.

Keep each campaign batch self-contained. Do not overwrite source references when producing derivatives.

## Build, Test, and Development Commands

There is no dependency manifest or automated build system. Use lightweight checks from the repository root:

```sh
rg --files creative-assets                  # inventory tracked deliverables
file creative-assets/the-inspire-home/aug-2026/final/*
sips -g pixelWidth -g pixelHeight creative-assets/the-inspire-home/aug-2026/final/*.png
```

Run `git diff --check` before committing when this directory is placed under Git; it catches whitespace errors in Markdown.

## Style & Naming Conventions

Write Markdown in UTF-8 with sentence-case headings, short paragraphs, and compact tables. Use Australian spelling and `A$` for campaign currency. Name creative files with a zero-padded sequence and lowercase kebab case, for example `04-maleny-jute.png`. Keep the same sequence and stem across `final/`, `meta-upload/`, and the manifest. Date reports using ISO order: `meta-performance-report-2026-08-16.md`.

Never invent prices, reviews, guarantees, product properties, or campaign outcomes. Preserve the photographed product’s design, colour, pile, and material appearance.

## Testing Guidelines

Manually inspect every exported image for cropping, legibility, colour fidelity, and correct product representation. Confirm file type and dimensions with the commands above. Cross-check on-image copy, primary text, CTA, and destination against `creative-manifest.md`. Verify destination URLs return successfully before launch, and reconcile published IDs and budgets in `meta-launch-log.md`.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no existing convention can be inferred. Use concise, imperative commits such as `Add August Meta performance report` or `Refresh Maleny upload asset`. Pull requests should describe the campaign and funnel, list changed assets, note claim and URL verification, and include visual previews for creative changes. Link the relevant brief or issue when one exists.

## Security & Configuration

Do not commit access tokens, cookies, customer exports, or private audience data. Treat account, Pixel, and ad IDs as operational metadata and include them only where needed for campaign traceability.
