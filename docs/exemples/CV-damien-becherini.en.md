# Damien BECHERINI

**AI & AUTOMATION DEVELOPER — AGENTS, MCP, PLATFORMS**
*(business tools driven by agents · operations automation · Python, PHP, Docker, Linux)*

damien@becherini.fr
Portfolio & case studies: **[damien.becherini.fr](https://damien.becherini.fr)**
St-Pierre-lès-Nemours, France — direct train to Paris Gare de Lyon
[LinkedIn](https://linkedin.com/in/damien-becherini) · [GitHub](https://github.com/DamienBecherini)

---

## Summary

Developer and platform designer — **12 years in IT, including 7 in web engineering**, Linux administrator since 2014. For **Université Paris-Saclay**, I designed and automated a containerised hosting platform: **a Python API with 89 routes and a CLI with 190+ commands**, **170+ sites in production, 150 of them migrated in one month** with no downtime, with **automated compliance checks** every night and self-healing after incidents.

**I use generative AI to automate.** I develop daily with **Claude Code**: parallel agents, **reusable skills** I write for my own pipelines (résumés, quotes, activity tracking), blocking CI and human review. I designed **MCP servers** that connect an agent to a calculation engine and to a tracking database, and a **monitoring agent** that updates my guide to self-hosted AI every week.

My rule: the agent proposes, the checks decide. Figures come from the tools, never from the model, and nothing is applied without approval.

---

## Technical Skills

*   **Generative AI & agents:** **Claude Code** (advanced daily use), Cursor, Codex; design of reusable **prompts and skills**; **MCP servers** (tools, prompts, catalogue designed for the model's context, actions approved by the user); **LangGraph** (public project: maintenance agent for a technical guide, human in the loop); self-hosted LLMs (vLLM, LiteLLM, quantisation).
*   **Infrastructure automation:** Python (Flask, Click), Bash, Node.js, **workers on Redis queues** with resume after interruption, scheduler, operations CLI; standardised configuration enforced across a whole fleet; Docker / Compose, Proxmox.
*   **Compliance & automated checks:** nightly integrity checks, policies enforced by default (banned plugins, WAF rules, certificates), drift detection and self-healing, blocking of inconsistent releases.
*   **Applications & data:** **object-oriented PHP 8** and WordPress (expert), **React 19 + TypeScript**, REST / JSON APIs, webhooks, ingestion of e-mails and web pages; SQL (MariaDB / MySQL, SQLite).
*   **Linux & security:** Debian / Ubuntu, Nginx / Apache, TLS / ACME, WAF, CrowdSec, **SSO / CAS**, secrets management, isolated backups (Restic) and tested restores.
*   **CI/CD & quality:** **13 public GitHub Actions workflows** (SonarQube quality gate, end-to-end tests, mutation testing), GitLab CI daily; Vitest, Playwright; load testing (k6).

---

## Selected Projects

*   **Automated hosting platform** — Université Paris-Saclay: orchestration API (89 routes), CLI (190+ commands), automated migrations with rollback, **monitoring daemon** (parallel HTTP probes across the fleet, self-healing), **compliance policies applied every night**, documentation published automatically to the IT department's wiki. *[Case study](https://damien.becherini.fr/realisations/hebergement-wordpress-universite-paris-saclay/)*
*   **postuler-juste, a job search driven by an AI agent** — open-source project (MIT): SQLite database, React dashboard, CLI and an **MCP server** usable without a terminal (Claude Desktop); the agent triages e-mail alerts, scores offers with a versioned rule grid and prepares applications that the user approves and sends. The rules compute, the model does not decide alone; this résumé was produced with it. *[Code on GitHub](https://github.com/DamienBecherini/postuler-juste)*
*   **Simulator driven by an agent through MCP** — public project: TypeScript calculation engine, **MCP server with 16 tools**, **2,350 tests**, blocking CI. *[Code on GitHub](https://github.com/DamienBecherini/simulateur-independant-fr)*
*   **"Zero to Hero: On-Premise AI" guide** — 160 notes in French, 118 in English (local inference, RAG, agents, model gateways, security); updated by a **weekly monitoring agent**, under automated audits in CI. *[Online guide](https://ia-on-prem.damien.becherini.fr/)*

<!-- page-break -->

---

## Experience

### 06/2025 – 10/2026 · Orsay · Hybrid
**Platform designer & developer (PaaS) — Freelance** — *Université Paris-Saclay*

The initial brief (a cPanel / Plesk-style hosting panel on Docker) did not hold up: I investigated a barely documented existing setup, cross-checked information from the security, systems and development teams, wrote the specification and proposed a bespoke containerised platform, sized for the university's fleet of several hundred WordPress sites and PHP applications. A three-month proof of concept that became a sixteen-month assignment.

*   **Automation:** Python (Flask) API with **89 routes**, asynchronous workers on Redis queues with resume after interruption, nightly scheduler, CLI with **190+ commands**.
*   **Compliance & reliability:** platform standards applied to every site, nightly integrity checks of plugins, banned-plugin list enforced by default, probes and self-healing, blocking of inconsistent releases, isolated backups and tested restores.
*   **Industrialisation:** **170+ sites in production, 150 of them migrated in one month** with no downtime; sizing through **load tests of up to 250 sites on a single node**.
*   **Security:** separate control plane, WAF, CrowdSec, SSO / CAS.
*   **Team:** supervision of one developer, code reviews, L1 / L2 / L3 operations documentation generated from the code, user training.

### 01/2019 – present · Remote / Paris region
**Developer & tool designer — Self-employed**

Assignments for SMEs, agencies, local authorities and institutions, from gathering requirements to going live.

*   **AI-driven tools:** MCP servers, Claude Code skills and pipelines, monitoring agents; development by guiding coding agents, under CI and human review.
*   **Integrations & business tools:** CRM, ERP and SaaS through REST / JSON APIs, webhooks; bespoke tools; WordPress expert (custom themes and plugins, Gutenberg blocks, WooCommerce).
*   **Operations & security:** Linux servers, hosting, hardening, updates, production incidents, Proxmox homelab.

### 2016 – 2017 · Vercors, France
**IoT & embedded systems R&D project (C/C++)**

Hardware and software prototyping of a connected (IoT) ecosystem, in a pair: a fleet of **Arduino** microcontrollers communicating **by radio** with a central node (custom protocol), a management "mini-OS", and a remote control and monitoring interface.

### 01/2014 – 04/2016 · Vercors, France
**IT & systems technician — Self-employed**

*   **Linux & hardware administration:** building, configuring and running **high-performance Linux servers** (intensive GPU computing); nano-servers (Raspberry Pi, NAS, firewalls).
*   **Systems, networks & support:** local networks, automated backups, data recovery, diagnosis and incident resolution.

---

## Education & Certifications

*   **Docker Mastery: with Kubernetes + Swarm from a Docker Captain** (2025)
*   **Top 5% in LinkedIn skill assessments** (2022): WordPress, PHP, front-end development
*   **PHP certification** — CodinGame (2023)
*   **Web Developer (two-year post-secondary level)** — École Supérieure Aristée (2018)
*   **French scientific baccalaureate**, engineering sciences option (2003)

## Languages

*   French (native)
*   English (professional)
