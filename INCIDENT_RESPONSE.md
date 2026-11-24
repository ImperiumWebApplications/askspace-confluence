# Security Incident Response Plan — AskSpace Software

**Applies to:** `AskSpace - Questions & FAQ for Confluence` (`app.askspace.confluence.qa`)  
**Security Contact:** Aditya Singh (`support@askspace.app` · Atlassian Ecosystem Portal: `adityasingh222247@gmail.com`)  
**Effective Date:** November 24, 2026  
**Architecture Baseline:** 100% Native Atlassian Forge (`nodejs22.x` + Forge SQL, zero external servers, zero external egress, zero third-party subprocessors).

---

## 1. Purpose & Scope

This Incident Response Plan establishes the procedures AskSpace Software follows to detect, triage, contain, remediate, and communicate any security vulnerability or security incident affecting **AskSpace - Questions & FAQ for Confluence**, aligned with:
- Atlassian Marketplace Security Bug Fix Policy
- Atlassian Marketplace App Security Incident Management Guidelines

---

## 2. Roles & Escalation Contacts

- **Incident Commander & Security Contact:** Aditya Singh (Primary & Security role on Partner ID `1068150190`, active account on `ecosystem.atlassian.net`).
- **Public Reporting Channel:** `support@askspace.app` and https://askspace.app/support.html (acknowledgement target: within **24 hours** for Critical/High security reports).
- **Atlassian Escalation Channel:** Atlassian Marketplace Security (`AMS`) / Developer & Marketplace Support Portal (`ecosystem.atlassian.net`).

---

## 3. Severity Classification & Remediation SLAs

Aligned with Atlassian Marketplace Security Bug Fix SLAs:

| Severity | Examples | Initial Triage | Target Fix / Patch SLA |
|---|---|---|---|
| **Critical** | Active data exposure, auth bypass, unauthorized cross-tenant access, critical RCE/SQLi | ≤ 24 hours | ≤ 2 weeks (immediate emergency hotfix prioritized) |
| **High** | Privilege escalation (non-admin performing admin action), stored XSS, high-impact dependency vuln | ≤ 24 hours | ≤ 4 weeks |
| **Medium** | Moderate input validation bug, non-critical scope over-request, moderate dependency vuln | ≤ 3 business days | ≤ 6 weeks |
| **Low** | Minor hardening improvement, informational finding | ≤ 5 business days | ≤ 24 weeks |

---

## 4. Six-Phase Response Procedure

### Phase 1: Detection & Intake
Security reports may arrive via `support@askspace.app`, Atlassian Marketplace Security (`AMS` tickets on `ecosystem.atlassian.net`), customer reports, or automated `npm audit` / `forge lint` scans. Every report is logged immediately with receipt timestamp, reporter, affected version, and initial severity.

### Phase 2: Triage & Validation
1. Reproduce the issue in the isolated `development` Forge environment (`adityasingh222247.atlassian.net`) — never test exploits against customer sites.
2. Confirm blast radius: affected Forge versions, scopes, SQL tables, and whether any End-User Data was accessed or modified without authorization.
3. Inspect Forge runtime logs via `forge logs -e production` (without exporting or exposing sensitive customer content).

### Phase 3: Containment
1. Because AskSpace runs exclusively inside Atlassian Forge with zero external servers, containment focuses on:
   - Deploying an immediate defensive Forge patch (`forge deploy -e production`) disabling or restricting the vulnerable code path, OR
   - Coordinating with Atlassian Ecosystem Support if an emergency app version rollback or suspension is required.
2. Rotate any compromised Atlassian CLI API tokens immediately at `id.atlassian.com/manage-profile/security/api-tokens` and revoke affected GitHub / Vercel / Zoho sessions.

### Phase 4: Eradication & Verification
1. Fix the root cause in code (`src/`), add regression unit tests (`tests/`), and verify `npm run check` (`tsc --noEmit` + `vitest run`), `npm audit --omit=dev`, and `forge lint` pass cleanly.
2. Deploy sequentially to `development` → `staging` → `production` via `forge deploy` and verify live behavior.

### Phase 5: Communication & Notification
- **Atlassian Notification:** For confirmed security incidents or critical vulnerabilities affecting customers, notify Atlassian promptly via `ecosystem.atlassian.net` using Atlassian's App Security Incident / Vulnerability Notification templates.
- **Customer Notification:** Notify affected customers without undue delay (and within **72 hours** of confirming a personal-data security breach, per our published DPA at https://askspace.app/dpa.html) with clear impact summary, fixed version number, and recommended actions.

### Phase 6: Post-Incident Review
Within 7 business days of resolution, document:
1. Timeline of detection, containment, and fix deployment.
2. Root cause and why existing tests/scans missed it.
3. Permanent preventive controls (new Vitest tests, stricter input validation, updated CI/audit checks).

---

## 5. Preventive Security Controls

- **Zero External Infrastructure:** All compute and storage execute inside Atlassian Forge (`Runs on Atlassian`), inheriting Atlassian Cloud encryption at rest, TLS in transit, tenant isolation, and Data Residency.
- **Least-Privilege User Context:** All Confluence REST API calls use `api.asUser()`; zero `asApp()` elevation, zero web triggers, zero Forge remotes, and zero external egress domains.
- **Parameterized Queries:** 100% of `@forge/sql` queries use `prepare().bindParams()` and integer clamping (`clampInt`) to prevent SQL injection.
- **Pre-Release Scans:** `forge lint`, strict TypeScript compilation, Vitest tests, and `npm audit` are executed before production releases.
- **Annual Review:** This plan is reviewed at least annually or following any confirmed security incident.
