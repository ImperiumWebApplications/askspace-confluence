# AskSpace - Questions & FAQ for Confluence

100% native Atlassian Forge internal Q&A and verified FAQ hub for Confluence Cloud — built for the **"Runs on Atlassian"** badge (zero external servers, zero external data egress, Atlassian-hosted Forge SQL, Paid-via-Atlassian ready, and 0% Atlassian revenue share on the first $1M lifetime revenue).

## Features
- **Global & Space Q&A Hubs** (`confluence:globalPage` & `confluence:spacePage`)
- **Inline Q&A + Accepted Answers Macro** (`macro` + live `macroConfig`) displaying verified answers directly on any Confluence page
- **Author & Space/Site Admin Solution Verification** via Confluence REST API v2 permission checks
- **1-Click Promote to Confluence Page** (`POST /wiki/api/v2/pages`, valid Confluence Storage Format)
- **Tag Governance** (admin tag rename & duplicate merge), **Watchers & In-App Notifications**, **Contributor Leaderboard**, **Governance Audit Log**, and **CSV Export**
- **Native Atlassian Rovo Agent & Action** (`rovo:agent` + `search-verified-qa`)
- **Paid-via-Atlassian License Gating** (`app.licensing.enabled: true`)

## Local Verification

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
npm run check
```

## Deploy & Marketplace Submission
See [`marketplace/SUBMISSION_KIT.md`](./marketplace/SUBMISSION_KIT.md) for the exact deploy commands, pricing table, listing copy, and 250+ character scope justifications.
Static Privacy Policy, EULA, Security, and Support pages ready for GitHub Pages / Cloudflare Pages live in [`docs/`](./docs/).
