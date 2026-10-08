# Step 2 — Cluster Report

- **1746** pages, **259** structural clusters

## Coverage by tier

| Tier | Meaning | Clusters | Pages | % |
| ------ | --------- | ---------- | ------- | --- |
| A | High confidence — proceed to Step 3 as-is | 5 | 1052 | 60.3% |
| B | Needs review — confirm grouping / split mixed | 30 | 415 | 23.8% |
| C | Long tail — project-rule candidates, not templates | 224 | 279 | 16.0% |

## Tier A — proceed to Step 3

These are large, structurally-pure clusters. Build these block sets first.

| ID | Pages | Templates | Representative |
| ---- | ------- | ----------- | ---------------- |
| C01 | 677 | blog-post×614, blog-post-2×57, blog-post-3×2, blog-bird-knack.json×1, … | `blog-bird-knack.json` |
| C02 | 205 | blog-tag×205 | `blog-tag__blog-tag-3nf.json` |
| C03 | 91 | template-detail×88, case-study×3 | `case-study__case-study-arizona-autism.json` |
| C04 | 42 | blog-post×42 | `blog-post__blog-ai-app-builder-benchmarks.json` |
| C05 | 37 | blog-post×37 | `blog-post__blog-airtable-vs-caspio.json` |

## Tier B — needs review

Mid-size or template-mixed clusters. A mixed cluster is not necessarily wrong — different template labels can share the same EDS block set. Confirm or split.

| ID | Pages | Purity | Templates | Representative |
| ---- | ------- | -------- | ----------- | ---------------- |
| C06 ⚠️ | 31 | 0.677 | app-category×21, testimonial×5, pricing×4, page-25×1 | `app-category__app-category-accounting.json` |
| C07 | 29 | 1.0 | blog-post×29 | `blog-post__blog-ai-app-builder-healthcare-hipaa.json` |
| C08 | 29 | 1.0 | template-category×29 | `template-category__template-industry-construction.json` |
| C09 | 27 | 1.0 | blog-tag×27 | `blog-tag__blog-tag-ai-assisted-models.json` |
| C10 | 26 | 1.0 | blog-category×26 | `blog-category__blog-category-compare-airtable.json` |
| C11 | 26 | 1.0 | video×26 | `video__video-airtable-alternative-knack-comparison.json` |
| C12 ⚠️ | 24 | 0.583 | solution-category×14, case-study-category×9, page-4×1 | `case-study-category__case-study-category-features-field-services-construction.json` |
| C13 ⚠️ | 24 | 0.792 | solution-category×19, case-study-category×5 | `case-study-category__case-study-category-features-professional-services.json` |
| C14 | 24 | 1.0 | video×24 | `video__video-automatically-resize-images-knack.json` |
| C15 | 21 | 1.0 | integration×21 | `integration__integrations-bigcommerce-knack-integration.json` |
| C16 | 16 | 1.0 | integration×16 | `integration__integrations-airtable-knack-integration.json` |
| C17 | 15 | 0.933 | case-study×14, case-study-blakely-construction.json×1 | `case-study-blakely-construction.json` |
| C18 | 13 | 1.0 | integration×13 | `integration__integrations-facebook-knack-integration.json` |
| C19 | 12 | 1.0 | case-study×12 | `case-study__case-study-corona-locator-nederland.json` |
| C20 | 10 | 1.0 | video×10 | `video__video-build-hipaa-compliant-apps-without-code.json` |
| C21 | 7 | 1.0 | blog-category×7 | `blog-category__blog-category-compare-asana.json` |
| C22 | 7 | 1.0 | blog-category×7 | `blog-category__blog-category-compare-make.json` |
| C23 | 7 | 1.0 | blog-tag×7 | `blog-tag__blog-tag-airtable.json` |
| C24 | 7 | 1.0 | template-detail-2×7 | `template-detail-2__templates-census-bed-management.json` |
| C25 | 7 | 0.857 | use-case×6, use-case-3×1 | `use-case-3__use-cases-customer-onboarding-portal.json` |
| C26 | 6 | 1.0 | blog-category×6 | `blog-category__blog-category-compare-bubble.json` |
| C27 | 6 | 1.0 | download×6 | `download__download-simple-case-management-template.json` |
| C28 ⚠️ | 6 | 0.5 | solution-2×3, solution-3×2, solution×1 | `solution-2__solutions-education.json` |
| C29 | 5 | 1.0 | blog-tag×5 | `blog-tag__blog-tag-app-building.json` |
| C30 | 5 | 1.0 | download×5 | `download__download-simple-customer-payment-template.json` |
| C31 | 5 | 1.0 | integration×5 | `integration__integrations-brevo-knack-integration.json` |
| C32 | 5 | 0.8 | page-3×4, page-4×1 | `page-3__cookies.json` |
| C33 | 5 | 1.0 | page×5 | `page__compare-knack-vs-base44-side-by-side-features-comparison.json` |
| C34 | 5 | 1.0 | video×5 | `video__video-business-apps-no-code.json` |
| C35 | 5 | 1.0 | video×5 | `video__video-customer-self-service-portal-without-code.json` |

## Tier C — long tail (project-rule candidates)

224 clusters, 279 pages. These pages are structurally unique — often the homepage, pricing, or bespoke landing pages where **site-specific conventions live**. Feed these to the Step 2.1 long-tail scan to flag novel blocks and propose project rules. Do NOT treat each as its own template.

| Dominant template | Clusters | Pages |
| ------------------- | ---------- | ------- |
| page | 34 | 34 |
| integration | 23 | 31 |
| download | 17 | 26 |
| page-2 | 12 | 12 |
| case-study | 7 | 13 |
| page-5 | 7 | 7 |
| page-6 | 7 | 7 |
| template-detail-2 | 6 | 10 |
| solution-2 | 6 | 8 |
| solution-3 | 6 | 8 |
| use-case | 5 | 9 |
| solution | 5 | 7 |
| page-8 | 5 | 5 |
| page-7 | 4 | 6 |
| page-3 | 4 | 8 |
| page-10 | 4 | 5 |
| page-9 | 4 | 5 |
| page-11 | 3 | 3 |
| page-12 | 3 | 3 |
| page-13 | 3 | 3 |
| page-14 | 3 | 3 |
| page-15 | 3 | 3 |
| page-16 | 3 | 3 |
| page-17 | 3 | 3 |
| page-4 | 3 | 3 |
| blog-category | 2 | 4 |
| page-18 | 2 | 4 |
| solution-4 | 2 | 3 |
| page-19 | 2 | 2 |
| page-20 | 2 | 2 |
| page-21 | 2 | 2 |
| page-22 | 2 | 2 |
| page-23 | 2 | 2 |
| page-24 | 2 | 2 |
| video | 1 | 4 |
| blog-post-4 | 1 | 3 |
| ebook-category | 1 | 1 |
| integration-2 | 1 | 1 |
| page-26 | 1 | 1 |
| page-27 | 1 | 1 |
| page-28 | 1 | 1 |
| page-29 | 1 | 1 |
| page-30 | 1 | 1 |
| page-31 | 1 | 1 |
| page-32 | 1 | 1 |
| page-33 | 1 | 1 |
| page-34 | 1 | 1 |
| page-35 | 1 | 1 |
| page-36 | 1 | 1 |
| page-37 | 1 | 1 |
| page-38 | 1 | 1 |
| page-39 | 1 | 1 |
| page-40 | 1 | 1 |
| page-41 | 1 | 1 |
| page-42 | 1 | 1 |
| page-43 | 1 | 1 |
| solution-5 | 1 | 1 |
| solution-6 | 1 | 1 |
| solution-7 | 1 | 1 |
| template-detail-3 | 1 | 1 |
