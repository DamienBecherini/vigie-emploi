# Damien BECHERINI

**DÉVELOPPEUR IA & AUTOMATISATION — AGENTS, MCP, PLATEFORMES**
*(outils métier pilotés par des agents · automatisation de l'exploitation · Python, PHP, Docker, Linux)*

damien@becherini.fr
Portfolio & études de cas : **[damien.becherini.fr](https://damien.becherini.fr)**
St-Pierre-lès-Nemours (77) — accès en train direct Paris Gare de Lyon (ligne R)
[LinkedIn](https://linkedin.com/in/damien-becherini) · [GitHub](https://github.com/DamienBecherini)

---

## Résumé

Développeur et concepteur de plateformes — **12 ans d'informatique dont 7 d'ingénierie web**, administrateur Linux depuis 2014. Pour l'**Université Paris-Saclay**, j'ai conçu et automatisé une plateforme d'hébergement conteneurisée : **API Python de 89 routes, CLI de 190+ commandes**, **170+ sites en production, dont 150 migrés en un mois** sans coupure, avec des **contrôles de conformité automatiques** chaque nuit et une auto-réparation après incident.

**L'IA générative, je la pratique pour automatiser.** Je développe au quotidien avec **Claude Code** : agents en parallèle, **skills réutilisables** que j'écris pour mes propres chaînes (CV, devis, suivi d'activité), CI bloquante et revue humaine. J'ai conçu des **serveurs MCP** qui branchent un agent sur un moteur de calcul et sur une base de suivi, et un **agent de veille** qui maintient chaque semaine mon guide sur l'IA auto-hébergée.

Ma ligne : l'agent propose, les contrôles tranchent. Les chiffres viennent des outils, jamais du modèle, et rien n'est appliqué sans validation.

---

## Compétences Techniques

*   **IA générative & agents :** **Claude Code** (usage avancé quotidien), Cursor, Codex ; conception de **prompts et de skills** réutilisables ; **serveurs MCP** (outils, prompts, catalogue pensé pour le contexte du modèle, actions validées par l'utilisateur) ; **LangGraph** (projet public : agent de maintenance d'un guide technique, humain dans la boucle) ; LLM auto-hébergés (vLLM, LiteLLM, quantification).
*   **Automatisation d'infrastructure :** Python (Flask, Click), Bash, Node.js, **workers sur files Redis** avec reprise sur interruption, planificateur, CLI d'exploitation ; standardisation des configurations appliquée à tout un parc ; Docker / Compose, Proxmox.
*   **Conformité & contrôles automatiques :** contrôle d'intégrité nocturne, politiques appliquées d'office (extensions interdites, règles WAF, certificats), détection d'écarts et auto-réparation, blocage d'une mise en production incohérente.
*   **Applications & données :** **PHP 8 POO** et WordPress (expert), **React 19 + TypeScript**, API REST / JSON, webhooks, ingestion d'e-mails et de pages web ; SQL (MariaDB / MySQL, SQLite).
*   **Linux & sécurité :** Debian / Ubuntu, Nginx / Apache, TLS / ACME, WAF, CrowdSec, **SSO / CAS**, gestion des secrets, sauvegardes isolées (Restic) et restaurations testées.
*   **CI/CD & qualité :** **13 workflows GitHub Actions** publics (porte qualité SonarQube, tests de bout en bout, mutation), GitLab CI au quotidien ; Vitest, Playwright ; tests de charge (k6).

---

## Réalisations sélectionnées

*   **Plateforme d'hébergement automatisée** — Université Paris-Saclay : API d'orchestration (89 routes), CLI (190+ commandes), migrations automatisées avec retour arrière, **démon de surveillance** (sondes HTTP parallèles sur tout le parc, auto-réparation), **politiques de conformité appliquées chaque nuit**, documentation publiée automatiquement sur le wiki de la DSI. *[Étude de cas](https://damien.becherini.fr/realisations/hebergement-wordpress-universite-paris-saclay/)*
*   **postuler-juste, recherche d'emploi pilotée par un agent IA** — projet open source (MIT) : base SQLite, tableau de bord React, CLI et **serveur MCP** utilisable sans terminal (Claude Desktop) ; l'agent trie les alertes e-mail, note les offres avec une grille de règles versionnée et prépare des candidatures que l'utilisateur valide et envoie. Les règles calculent, le modèle ne décide pas seul ; ce CV en est sorti. *[Code sur GitHub](https://github.com/DamienBecherini/postuler-juste)*
*   **Simulateur piloté par un agent via MCP** — projet public : moteur de calcul TypeScript, **serveur MCP de 16 outils**, **2 350 tests**, CI bloquante. *[Code sur GitHub](https://github.com/DamienBecherini/simulateur-independant-fr)*
*   **Guide « Zero to Hero : On-Premise AI »** — 160 notes en français, 118 en anglais (inférence locale, RAG, agents, passerelles de modèles, sécurité) ; mis à jour par un **agent de veille hebdomadaire**, sous audits automatiques en CI. *[Guide en ligne](https://ia-on-prem.damien.becherini.fr/)*

<!-- saut-de-page -->

---

## Expérience Professionnelle

### 06/2025 – 10/2026 · Orsay · Hybride
**Concepteur & développeur de plateforme (PaaS) — Freelance** — *Université Paris-Saclay*

Le brief initial (un panneau d'hébergement type cPanel / Plesk sous Docker) ne tenait pas : j'ai enquêté sur un existant très peu documenté, croisé les informations des équipes sécurité, systèmes et développement, rédigé le cahier des charges et proposé une plateforme conteneurisée sur mesure, dimensionnée pour le parc de plusieurs centaines de sites WordPress et applications PHP de l'université. POC de trois mois devenu seize mois de mission.

*   **Automatisation :** API Python (Flask) de **89 routes**, workers asynchrones sur files Redis avec reprise sur interruption, planificateur nocturne, CLI de **190+ commandes**.
*   **Conformité & fiabilité :** standards de plateforme appliqués à chaque site, contrôle d'intégrité nocturne des extensions, liste d'extensions interdites appliquée d'office, sondes et auto-réparation, blocage des mises en ligne incohérentes, sauvegardes isolées et restaurations testées.
*   **Industrialisation :** **170+ sites en production, dont 150 migrés en un mois** sans interruption ; dimensionnement par **tests de charge jusqu'à 250 sites sur un seul nœud**.
*   **Sécurité :** plan de contrôle séparé, WAF, CrowdSec, SSO / CAS.
*   **Équipe :** encadrement d'un développeur, revues de code, documentation N1 / N2 / N3 générée depuis le code, formation des utilisateurs.

### 01/2019 – aujourd'hui · Remote / Île-de-France
**Développeur & concepteur d'outils — Indépendant**

Missions pour des PME, agences, collectivités et institutions, du recueil du besoin à la mise en production.

*   **Outils pilotés par IA :** serveurs MCP, skills et chaînes Claude Code, agents de veille ; développement en guidant des agents de code, sous CI et revue humaine.
*   **Intégrations & outils métiers :** CRM, ERP et SaaS via API REST / JSON, webhooks ; outils sur mesure ; WordPress expert (thèmes et extensions sur mesure, blocs Gutenberg, WooCommerce).
*   **Exploitation & sécurité :** serveurs Linux, hébergement, durcissement, mises à jour, incidents de production, homelab Proxmox.

### 2016 – 2017 · Vercors
**Projet R&D IoT & systèmes embarqués (C/C++)**

Prototypage matériel et logiciel d'un écosystème connecté (IoT), en binôme : flotte de microcontrôleurs **Arduino** communiquant **par radio** avec un nœud central (protocole sur mesure), « mini-OS » de gestion, interface de pilotage et de monitoring à distance.

### 01/2014 – 04/2016 · Vercors
**Technicien informatique & systèmes — Indépendant**

*   **Administration Linux & matériel :** montage, configuration et exploitation de **serveurs Linux haute performance** (calcul GPU intensif) ; nano-serveurs (Raspberry Pi, NAS, firewalls).
*   **Systèmes, réseaux & support :** réseaux locaux, sauvegardes automatisées, récupération de données, diagnostic et résolution d'incidents.

---

## Formations & Certifications

*   **Docker Mastery: with Kubernetes + Swarm from a Docker Captain** (2025)
*   **Top 5 % des évaluations LinkedIn** (2022) : WordPress, PHP, développement front-end
*   **Certification PHP** — CodinGame (2023)
*   **Développeur Web (niveau Bac+2)** — École Supérieure Aristée (2018)
*   **Baccalauréat Scientifique (S)**, option Sciences de l'ingénieur (2003)

## Langues

*   Français natif
*   Anglais professionnel
