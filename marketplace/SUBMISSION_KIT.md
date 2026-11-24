# AskSpace - Questions & FAQ for Confluence — Marketplace Submission Kit

Everything below is formatted to pass Atlassian Marketplace Partner Review and Privacy & Security review on the first submission.

---

## 1. App Listing Metadata

- **App Name (41 / 60 chars max):** `AskSpace - Questions & FAQ for Confluence`
- **Tagline (106 chars):** `Internal Q&A & verified FAQ hub for Confluence Cloud — inline answer macros, Rovo AI & Runs on Atlassian.`
- **Hosting / Deployment:** Cloud — 100% Native Atlassian Forge (`Runs on Atlassian` eligible, zero external egress)
- **Billing Model:** Paid via Atlassian (0% Atlassian revenue share on your first \$1,000,000 lifetime Forge revenue)
- **Primary Categories:** `Documentation`, `Messaging`, `Knowledge management`
- **Keywords:** `questions, answers, Q&A, FAQ, forum, knowledge base, Rovo, Confluence questions`

---

## 2. Three Marketplace Highlights

1. **Inline Q&A + Verified Answers Macro:** Embed live Space or tag-filtered questions *together with their accepted answers* directly on any Confluence onboarding doc or runbook — no jumping across tabs.
2. **Author & Admin Solution Verification + 1-Click Page Publishing:** Both question authors and Space/Site Admins can mark an Accepted Solution, then promote verified threads into permanent Confluence pages in one click.
3. **100% Runs on Atlassian + Native Rovo AI:** Zero external servers and zero data egress. Stored entirely in tenant-isolated Forge SQL with a built-in Rovo Agent & Action for verified Q&A discovery.

---

## 3. Full Marketplace Description

> Stop losing company knowledge inside endless chat threads. **AskSpace - Questions & FAQ for Confluence** brings Stack Overflow-style Q&A natively into every Confluence Space — built 100% on Atlassian Forge with zero external data egress.
>
> **Core Capabilities**
> - **Global & Space Q&A Hubs:** Browse, search, filter by Space/tag/status, upvote/downvote, and track resolution rate metrics.
> - **Inline Q&A & FAQ Macro:** Type `/AskSpace` on any Confluence page to embed live questions **with their verified accepted answers displayed inline**.
> - **Author OR Admin Verification:** Space and Site Administrators can mark or update the Accepted Solution even if the original asker has left the team.
> - **1-Click Promote to Confluence Page:** Turn verified Q&A threads directly into formatted Confluence documentation pages and keep them linked.
> - **Tag Governance & Audit Trail:** Rename or merge duplicate tags cleanly, monitor in-app notifications on watched questions, review full governance audit logs, and export Q&A records to CSV.
> - **Native Atlassian Rovo Assistant:** Built-in Rovo Agent and Action let employees query verified AskSpace answers directly inside Rovo.
>
> **Security First ("Runs on Atlassian")**
> AskSpace runs exclusively on Atlassian Forge compute and Forge SQL storage — no external hosting, no third-party subprocessors, and automatic alignment with your Confluence Cloud Data Residency region.

---

## 4. Recommended Paid-via-Atlassian Pricing Schedule (USD)

*Positioned ~74% below Atlassian's legacy `Questions for Confluence` (\$2.50/user/mo) while capturing strong B2B MRR:*

| User Tier | Monthly Price | Annual Price (10× Monthly) |
|---|---|---|
| 1 – 10 users | **\$0 (Free)** | **\$0 (Free)** |
| 11 – 100 users | **\$0.65 / user / mo** | **\$6.50 / user / yr** |
| 101 – 250 users | **\$0.48 / user / mo** | **\$4.80 / user / yr** |
| 251 – 1,000 users | **\$0.30 / user / mo** | **\$3.00 / user / yr** |
| 1,001+ users | **\$0.18 / user / mo** | **\$1.80 / user / yr** |

---

## 5. Privacy & Security Tab — Ready-to-Paste Scope Justifications (>250 chars each)

*(Atlassian requires explicit 250–5,000 character justifications for every scope declared in `manifest.yml`.)*

### `read:space:confluence`
> AskSpace uses `read:space:confluence` strictly under the signed-in user's context (`api.asUser()`) to list Confluence Spaces the user is permitted to access, resolve Space keys to numeric Space IDs for Space-scoped Q&A hubs and inline FAQ macros, and inspect Space Administrator permissions (`GET /wiki/api/v2/spaces/{id}/permissions`) so authorized Space Administrators can verify Accepted Solutions and govern duplicate tags. No Space data is sent outside Atlassian Forge.

### `read:page:confluence`
> AskSpace requests `read:page:confluence` solely so the AskSpace Q&A & FAQ Confluence Macro (`askspace-faq-macro`) can read host page and Space context when rendering live Q&A threads inline on a Confluence page. All reads run strictly under `api.asUser()` respecting native Confluence page restrictions, and no page content is stored externally or transmitted outside Atlassian Cloud.

### `write:page:confluence`
> AskSpace requests `write:page:confluence` exclusively to power the explicit, user-triggered "Publish to Confluence Page" button inside a verified Q&A thread. When an authorized user clicks this button on a question with an Accepted Solution, AskSpace calls `POST /wiki/api/v2/pages` via `api.asUser()` to create a formatted FAQ page in the user's chosen Confluence Space. AskSpace never modifies or creates Confluence pages automatically in the background.

### `read:confluence-user`
> AskSpace requests `read:confluence-user` via `api.asUser()` to retrieve the signed-in user's Atlassian Account ID, public display name, and site administrator operation flags (`GET /wiki/rest/api/user/current?expand=operations`). This enables accurate author attribution on questions, answers, comments, contributor leaderboards, and governance audit logs, as well as permission checks for site administrators. No user profile data ever leaves Atlassian Cloud.

### `storage:app`
> AskSpace uses `storage:app` to persist customer Q&A threads, answers, votes, normalized tags, comments, watch subscriptions, in-app notifications, and governance audit trail records exclusively inside Atlassian-hosted, tenant-isolated Forge SQL storage. All data stays within Atlassian's cloud security boundary, inherits the host Confluence site's Data Residency region, and uses zero external servers or third-party databases.

---

## 6. Exact End-to-End Deploy & Launch Commands (Run After `forge login`)

```bash
cd /Users/adityasingh/.gemini/antigravity/scratch/askspace-confluence
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22

# 1. Authenticate with your Atlassian Developer account (API token from id.atlassian.com/manage-profile/security/api-tokens)
forge login

# 2. Register the app to get your real Atlassian App ID (updates manifest.yml automatically)
forge register "AskSpace - Questions & FAQ for Confluence"

# 3. Validate manifest & scopes with live Atlassian schema
forge lint

# 4. Deploy to development and install on your free Developer Sandbox (go.atlassian.com/cloud-dev)
forge deploy -e development
forge install --product confluence -e development

# 5. Live-verify Global Page, Space Page, /AskSpace Macro, Admin Accept, 1-Click Publish to Page, and Rovo Agent!

# 6. Deploy Staging & Production (Paid-via-Atlassian requires staging + production)
forge deploy -e staging
forge deploy -e production

# 7. Turn on Distribution in developer.atlassian.com/console -> Distribution -> Share -> Enable Paid via Atlassian
# 8. Publish /docs folder to GitHub Pages (or Cloudflare Pages) for live Privacy, EULA, Security, and Support URLs
# 9. Submit in Atlassian Marketplace Partner Portal (marketplace.atlassian.com/manage/vendors)
```
