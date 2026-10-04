# Formation : CI/CD, sécurité et workflow Git professionnel

Ce document explique de A à Z tout ce qui a été mis en place sur le dépôt `pinpin59/test-claude`.
Il est écrit pour un développeur junior qui n'a jamais configuré de CI. À la fin, des exercices permettent de tout refaire seul sur un nouveau dépôt.

---

## Sommaire

1. [Les concepts de base](#1-les-concepts-de-base)
2. [Vue d'ensemble : le parcours d'une modification](#2-vue-densemble--le-parcours-dune-modification)
3. [Les outils utilisés, un par un](#3-les-outils-utilisés-un-par-un)
4. [Les fichiers du projet](#4-les-fichiers-du-projet)
5. [Mise en place manuelle de A à Z](#5-mise-en-place-manuelle-de-a-à-z)
6. [Le workflow au quotidien](#6-le-workflow-au-quotidien)
7. [Lire et réagir aux résultats](#7-lire-et-réagir-aux-résultats)
8. [Ce qu'on a vu en vrai sur test-claude](#8-ce-quon-a-vu-en-vrai-sur-test-claude)
9. [Erreurs fréquentes et solutions](#9-erreurs-fréquentes-et-solutions)
10. [Exercices pratiques](#10-exercices-pratiques)
11. [Glossaire](#11-glossaire)

---

## 1. Les concepts de base

### Git et GitHub, ce n'est pas la même chose

- **Git** est un logiciel installé sur ton ordinateur. Il enregistre l'historique de ton code (commits, branches).
- **GitHub** est un site web qui héberge des dépôts Git et ajoute des fonctionnalités autour : pull requests, issues, Actions, sécurité.
- **`gh`** est la ligne de commande de GitHub. Elle permet de faire depuis le terminal ce qu'on fait d'habitude sur le site (créer un dépôt, ouvrir une PR, fusionner).

### Branche

Une branche est une ligne de travail parallèle. `main` est la branche principale : elle doit toujours contenir du code qui fonctionne.
On ne travaille jamais directement dessus. On crée une branche par fonctionnalité ou correction (`feat/login`, `fix/crash-panier`).

### Pull Request (PR)

Une PR est une demande pour fusionner une branche dans `main`. C'est le moment où le code est vérifié :
- par des machines (tests, lint, analyse de sécurité) ;
- par des humains ou par une IA (relecture, la "review").

Tant que les vérifications ne sont pas au vert, la fusion est interdite.

### CI et CD

- **CI (Continuous Integration, intégration continue)** : à chaque modification, une machine récupère le code et lance automatiquement les vérifications. Si quelque chose casse, on le sait tout de suite, pas trois semaines plus tard.
- **CD (Continuous Delivery / Deployment, livraison continue)** : une fois le code fusionné, il est automatiquement déployé (sur un serveur, un store, Vercel...).

Sur test-claude, on a mis en place la **CI** et la sécurité. Il n'y a pas de CD, parce qu'il n'y a rien à déployer. La CD est expliquée en bonus à la fin de la section 5.

### Le principe des "couches de sécurité"

Aucun outil ne détecte tout. On en empile plusieurs, à des moments différents :

```
Sur ton ordinateur        Sur GitHub (au push)       Sur la PR                    En continu
------------------        --------------------       ---------                    ----------
gitleaks (secrets)        Push protection            CI : lint, types, tests      Dependabot
ESLint (lint-staged)      (secrets)                  CodeQL (failles)             (dépendances)
/code-review (Claude)                                Review Claude
                                                     Règles de protection de main
```

Plus un problème est détecté tôt, moins il coûte cher à corriger.

---

## 2. Vue d'ensemble : le parcours d'une modification

Voici ce qui se passe, étape par étape, quand tu modifies du code :

1. **Tu crées une branche** : `git switch -c feat/ma-feature`.
2. **Tu codes, puis tu fais `git commit`.**
   - Le **hook pre-commit** (géré par Husky) se déclenche tout seul.
   - **gitleaks** scanne les fichiers : s'il trouve une clé API ou un mot de passe, le commit est annulé.
   - **lint-staged** lance **ESLint** sur les fichiers modifiés : s'il y a une erreur, le commit est annulé.
3. **Tu fais `git push`.**
   - GitHub vérifie avec la **push protection** qu'aucun secret connu n'est envoyé.
4. **Tu ouvres une PR** (`gh pr create`). Trois choses démarrent en parallèle dans l'onglet **Actions** :
   - le workflow **CI** : installation, lint, vérification des types, tests ;
   - **CodeQL** : analyse de sécurité du code ;
   - le workflow **Claude Review** : Claude lit le diff et commente la PR.
5. **La règle "Protect main" vérifie** que :
   - le check `ci` est vert ;
   - CodeQL n'a trouvé aucune faille de gravité élevée ou critique ;
   - toutes les discussions sont résolues ;
   - la branche est à jour avec `main`.
6. **Si tout est vert, tu fusionnes en "squash"** : tous les commits de la branche deviennent un seul commit propre sur `main`. La branche est supprimée automatiquement.
7. **Chaque semaine, Dependabot** vérifie les dépendances et ouvre des PR de mise à jour, qui passent par les mêmes vérifications.

---

## 3. Les outils utilisés, un par un

Pour chaque outil, tu trouveras : ce que c'est, ce qu'il surveille, quand il s'active et où il est configuré.

### 3.1 Husky (hooks Git)

- **Ce que c'est** : une librairie npm qui installe des **hooks Git**. Un hook est un script que Git exécute automatiquement à certains moments (avant un commit, avant un push...).
- **Pourquoi Husky** : Git stocke ses hooks dans `.git/hooks`, un dossier qui n'est **pas** versionné. Tes collègues n'en profiteraient donc pas. Husky stocke les hooks dans `.husky/`, qui est versionné, et les active automatiquement à chaque `npm install`.
- **Comment il s'active** : le script `"prepare": "husky"` du `package.json`. npm exécute toujours `prepare` après un `npm install`.
- **Fichier** : `.husky/pre-commit`.
- **Documentation** : https://typicode.github.io/husky/

### 3.2 gitleaks (détection de secrets en local)

- **Ce que c'est** : un outil qui cherche des secrets dans le code : clés API, tokens GitHub, clés AWS, mots de passe, clés privées... Il connaît des centaines de formats.
- **Ce qu'il surveille** : les fichiers indexés (ceux que tu as ajoutés avec `git add`) au moment du commit.
- **Pourquoi c'est important** : un secret commité reste **pour toujours** dans l'historique Git, même si tu le supprimes au commit suivant. Sur un dépôt public, des robots scannent GitHub en permanence et l'exploitent en quelques minutes.
- **Comment il s'active** : il est appelé dans `.husky/pre-commit` avec `gitleaks git --pre-commit --staged --redact`.
  - `--staged` : scanne seulement ce qui va être commité.
  - `--redact` : masque le secret dans le message d'erreur, pour qu'il n'apparaisse pas dans le terminal.
- **Installation** : `brew install gitleaks`. Ce n'est pas un paquet npm, c'est un programme à installer sur chaque machine.
- **Documentation** : https://github.com/gitleaks/gitleaks

### 3.3 ESLint et lint-staged

- **ESLint** analyse le code JavaScript/TypeScript sans l'exécuter et signale les erreurs probables (variable inutilisée, code mort, mauvaises pratiques).
- **typescript-eslint** ajoute à ESLint les règles spécifiques à TypeScript.
- **lint-staged** lance ESLint **seulement sur les fichiers modifiés**, pas sur tout le projet. C'est beaucoup plus rapide, ce qui compte pour un hook lancé à chaque commit.
- **Où c'est configuré** :
  - `eslint.config.js` : les règles ESLint (format "flat config", le format actuel d'ESLint) ;
  - dans `package.json`, la clé `lint-staged` : `"*.{js,ts}": "eslint --max-warnings=0"`. `--max-warnings=0` fait échouer le lint dès le premier avertissement.

### 3.4 TypeScript (`tsc`) et Vitest

- **`tsc --noEmit`** vérifie les types sans générer de fichiers. C'est le script `npm run typecheck`.
- **Vitest** est le framework de tests (`npm test`). Les fichiers `*.test.ts` contiennent les tests.
- `tsconfig.json` est en mode `strict`, plus `noUncheckedIndexedAccess`. C'est le niveau de rigueur attendu en entreprise.

### 3.5 GitHub Actions (la CI)

- **Ce que c'est** : le système de CI intégré à GitHub. Tu décris des tâches dans des fichiers YAML placés dans `.github/workflows/`, et GitHub les exécute sur ses machines (des "runners", ici Ubuntu).
- **Vocabulaire d'un workflow** :
  - `on:` : **quand** il se déclenche (`pull_request`, `push`, `schedule`...) ;
  - `jobs:` : les tâches à lancer. Chaque job tourne sur une machine neuve ;
  - `steps:` : les étapes d'un job, exécutées dans l'ordre ;
  - `uses:` : utiliser une **action** toute faite (par exemple `actions/checkout` récupère le code) ;
  - `run:` : lancer une commande shell ;
  - `permissions:` : ce que le workflow a le droit de faire sur le dépôt. On donne toujours le minimum nécessaire (principe du moindre privilège) ;
  - `concurrency:` : si tu pousses deux fois de suite, le premier run est annulé, ce qui évite de gaspiller des minutes de calcul.
- **Où on voit les résultats** : onglet **Actions** du dépôt, ou en bas de chaque PR.
- **Coût** : gratuit et illimité sur les dépôts publics. Sur un dépôt privé, environ 2000 minutes par mois sont offertes avec un compte gratuit.

### 3.6 CodeQL (analyse de sécurité du code)

- **Ce que c'est** : l'outil d'analyse statique de sécurité de GitHub. On parle de **SAST** (Static Application Security Testing).
- **Ce qu'il surveille** : les failles classiques (injection SQL, injection de code, XSS, chemins de fichiers contrôlés par l'utilisateur, cryptographie faible...). Il suit le parcours d'une donnée : d'une **source** non fiable (une requête HTTP) jusqu'à un **sink** dangereux (`eval`, une requête SQL). C'est ce qu'on appelle l'analyse de "taint" (de propagation).
- **Comment il s'active** : en "default setup", GitHub gère tout seul. Il n'y a aucun fichier à écrire. Il se lance sur chaque PR, chaque push sur `main` et une fois par semaine.
- **Où le configurer** : Settings > Code security > Code scanning > CodeQL analysis.
- **Où voir les alertes** : onglet **Security** > Code scanning, et directement en commentaire sur la PR.
- **Coût** : gratuit sur les dépôts publics, payant (GitHub Code Security) sur les dépôts privés. L'alternative gratuite pour un dépôt privé est **Semgrep**, à lancer dans un workflow.

### 3.7 Secret scanning et push protection (secrets côté GitHub)

- **Secret scanning** : GitHub scanne tout le dépôt et son historique à la recherche de secrets. Il prévient aussi certains fournisseurs (AWS, Stripe...), qui peuvent révoquer la clé automatiquement.
- **Push protection** : bloque le `git push` s'il contient un secret reconnu. C'est le filet de sécurité si gitleaks n'est pas installé sur la machine d'un collègue.
- **Où** : Settings > Code security > Secret Protection.
- **Coût** : gratuit sur les dépôts publics.

### 3.8 Dependabot (dépendances)

Ton projet utilise des dizaines de librairies, qui elles-mêmes en utilisent des centaines. Une faille découverte dans l'une d'elles devient une faille dans ton projet.

Dependabot a trois fonctions :

| Fonction | Rôle | Où l'activer |
|---|---|---|
| Dependabot alerts | Te prévient si une dépendance a une faille connue (CVE) | Settings > Code security |
| Dependabot security updates | Ouvre automatiquement une PR qui corrige la faille | Settings > Code security |
| Dependabot version updates | Ouvre des PR pour garder les dépendances à jour, même sans faille | Fichier `.github/dependabot.yml` |

Notre `dependabot.yml` :
- vérifie npm et les GitHub Actions **chaque semaine** ;
- **regroupe** les dépendances de développement dans une seule PR (au lieu d'une PR par librairie) ;
- **ignore** les montées de version majeure de TypeScript (voir section 8).

### 3.9 Claude Code Action (review par IA)

- **Ce que c'est** : `anthropics/claude-code-action`, une action GitHub qui lance Claude dans la CI.
- **Deux workflows** :
  - `claude-review.yml` : à chaque PR ouverte ou mise à jour, Claude relit le diff et poste des commentaires en ligne sur le code, plus un résumé avec le verdict "OK pour merge" ou "A corriger avant merge" ;
  - `claude.yml` : Claude répond quand tu écris `@claude` dans une issue ou une PR (par exemple : "@claude explique ce changement").
- **Authentification** : le secret `CLAUDE_CODE_OAUTH_TOKEN`, lié à ton abonnement Claude.
- **Rôle** : un **conseil**, pas un blocage. Une IA peut se tromper (sur test-claude, elle a douté à tort que `checkout@v7` existe). C'est CodeQL, déterministe, qui bloque la fusion. Claude complète en repérant ce que CodeQL ne voit pas : logique métier, cas limites, qualité.
- **Économie** : la review ignore les PR en brouillon (draft) et les PR de Dependabot.

### 3.10 Ruleset "Protect main" (protection de branche)

C'est la pièce qui rend tout le reste **obligatoire**. Sans elle, les checks rouges ne seraient qu'informatifs.

| Règle | Effet |
|---|---|
| Restrict deletions | Impossible de supprimer `main` |
| Block force pushes | Impossible de réécrire l'historique de `main` |
| Require a pull request before merging | Plus de push direct sur `main` |
| Required approvals : 0 | Tu travailles seul, et GitHub interdit d'approuver sa propre PR |
| Require conversation resolution | Chaque commentaire de review doit être résolu |
| Allowed merge methods : Squash | Un seul commit propre par PR sur `main` |
| Require status checks : `ci` | La CI doit être verte |
| Require branches to be up to date | La branche doit contenir le dernier `main` avant de fusionner |
| Require code scanning results : CodeQL | Bloque si CodeQL trouve une faille élevée ou critique |

**Rulesets ou "branch protection rules" ?** Les rulesets sont le système récent de GitHub. Ils sont plus flexibles, et plusieurs règles peuvent se combiner. Les "branch protection rules" sont l'ancien système, encore très présent dans les tutoriels. Préfère les rulesets.

---

## 4. Les fichiers du projet

```
test-claude/
├── .github/
│   ├── dependabot.yml             Config Dependabot (mises à jour hebdo)
│   └── workflows/
│       ├── ci.yml                 CI : lint, typecheck, tests
│       ├── claude-review.yml      Review automatique de chaque PR
│       └── claude.yml             Claude répond aux mentions @claude
├── .husky/
│   └── pre-commit                 Hook : gitleaks puis lint-staged
├── src/
│   ├── math.ts                    Code
│   └── math.test.ts               Tests
├── .gitignore                     Fichiers jamais commités (node_modules, .env...)
├── .nvmrc                         Version de Node (22), utilisée par nvm ET par la CI
├── eslint.config.js               Règles ESLint
├── package.json                   Scripts, dépendances, config lint-staged
├── package-lock.json              Versions exactes installées (à toujours commiter)
├── tsconfig.json                  Config TypeScript stricte
└── README.md                      Doc du projet
```

### Le workflow CI expliqué ligne par ligne

```yaml
name: CI                         # Nom affiché dans l'onglet Actions

on:
  pull_request:                  # Se lance sur chaque PR...
  push:
    branches: [main]             # ...et sur chaque push sur main (après une fusion)

permissions:
  contents: read                 # Droit minimum : lire le code, rien d'autre

concurrency:
  group: ci-${{ github.ref }}    # Un seul run à la fois par branche
  cancel-in-progress: true       # Annule l'ancien run si on repousse

jobs:
  ci:                            # Nom du job = nom du "check" exigé par le ruleset
    runs-on: ubuntu-latest       # Machine Linux fournie par GitHub
    steps:
      - uses: actions/checkout@v7          # Récupère le code
      - uses: actions/setup-node@v7        # Installe Node...
        with:
          node-version-file: .nvmrc        # ...dans la version du .nvmrc
          cache: npm                       # Met en cache les paquets npm (plus rapide)
      - run: npm ci                        # Installe EXACTEMENT le package-lock.json
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

**`npm ci` ou `npm install` ?** En CI, on utilise toujours `npm ci`. Il installe les versions exactes du `package-lock.json` et échoue si le lockfile ne correspond pas au `package.json`. On teste donc exactement ce qui tourne en local.

---

## 5. Mise en place manuelle de A à Z

Tout ce qui suit peut se faire sur le site GitHub, sans ligne de commande (sauf la partie projet local).
Les intitulés exacts des menus GitHub peuvent légèrement changer avec le temps : si un nom ne correspond pas, cherche le mot-clé dans la page Settings.

### Étape 0 : prérequis sur ta machine

```bash
brew install git gh gitleaks node   # Outils de base
gh auth login                       # GitHub.com > HTTPS > Login with a web browser
gh auth setup-git                   # Git utilisera gh pour s'authentifier
```

### Étape 1 : créer le projet local

```bash
mkdir mon-projet && cd mon-projet
git init -b main
npm init -y
npm pkg set type=module private=true --json
echo 22 > .nvmrc

# Outils de dev
npm install -D typescript eslint @eslint/js typescript-eslint vitest husky lint-staged

# Scripts
npm pkg set scripts.lint="eslint ." scripts.typecheck="tsc --noEmit" scripts.test="vitest run"
```

Crée ensuite `tsconfig.json`, `eslint.config.js`, `.gitignore` et un premier fichier dans `src/` avec son test, en t'inspirant de ceux de test-claude.

Vérifie que tout passe : `npm run lint && npm run typecheck && npm test`.

### Étape 2 : installer les hooks locaux

```bash
npx husky init      # Crée .husky/pre-commit et ajoute le script "prepare"
```

Remplace le contenu de `.husky/pre-commit` par :

```sh
gitleaks git --pre-commit --staged --redact --no-banner
npx lint-staged
```

Ajoute la config lint-staged :

```bash
npm pkg set lint-staged='{"*.{js,ts}":"eslint --max-warnings=0"}' --json
```

### Étape 3 : écrire les workflows

Crée `.github/workflows/ci.yml` (voir section 4) et `.github/dependabot.yml` (copie celui de test-claude).

### Étape 4 : créer le dépôt sur GitHub

**Avec le site :**
1. En haut à droite, clique sur **+** > **New repository**.
2. Donne un nom, choisis **Public** ou **Private**, et ne coche rien (pas de README : tu en as déjà un).
3. Clique sur **Create repository**.
4. GitHub affiche des commandes : utilise celles de la section "push an existing repository".

```bash
git add -A
git commit -m "chore: initial setup"
git remote add origin https://github.com/TON-PSEUDO/mon-projet.git
git push -u origin main
```

**Avec `gh` (une seule commande) :**

```bash
gh repo create mon-projet --public --source=. --push
```

### Étape 5 : réglages des PR

**Settings** (onglet tout à droite du dépôt) > **General** > descends jusqu'à **Pull Requests** :
- décoche **Allow merge commits** ;
- coche **Allow squash merging**, avec le message par défaut "Pull request title and description" ;
- décoche **Allow rebase merging** ;
- coche **Automatically delete head branches**.

### Étape 6 : activer la sécurité

**Settings** > **Code security** (menu de gauche, section "Security") :

1. **Dependabot** :
   - **Dependabot alerts** > Enable ;
   - **Dependabot security updates** > Enable.
2. **Code scanning** > **CodeQL analysis** > **Set up** > **Default** > **Enable CodeQL**.
   La première analyse se lance tout de suite : tu peux la suivre dans l'onglet **Actions**.
3. **Secret Protection** :
   - **Secret scanning** > Enable ;
   - **Push protection** > Enable.

### Étape 7 : protéger main avec un ruleset

**Settings** > **Rules** > **Rulesets** > **New ruleset** > **New branch ruleset** :

1. **Ruleset Name** : `Protect main`.
2. **Enforcement status** : **Active**.
3. **Target branches** > **Add target** > **Include default branch**.
4. Dans **Branch rules**, coche :
   - **Restrict deletions** ;
   - **Block force pushes** ;
   - **Require a pull request before merging**, puis déplie les options :
     - Required approvals : **0** ;
     - coche **Require conversation resolution before merging** ;
     - Allowed merge methods : garde seulement **Squash** ;
   - **Require status checks to pass**, puis :
     - coche **Require branches to be up to date before merging** ;
     - **Add checks** > tape `ci` > sélectionne-le. Le check n'apparaît qu'après avoir tourné au moins une fois : pousse d'abord ton code ;
   - **Require code scanning results** > **Add tool** > **CodeQL**, avec Security alerts : **High or higher** et Alerts : **Errors**.
5. Clique sur **Create**.

Pour vérifier, essaie `git push` directement sur `main` : GitHub doit refuser.

### Étape 8 : ajouter la review Claude

**Méthode simple** : dans Claude Code, lance `/install-github-app`, puis choisis le dépôt. L'outil installe l'application GitHub Claude, crée le secret et ouvre une PR avec les workflows.

**Méthode manuelle** :
1. Installe l'application : https://github.com/apps/claude > **Configure** > choisis le dépôt.
2. Dans ton terminal, lance `claude setup-token`. Il génère un token lié à ton abonnement. **Ne le colle jamais dans un fichier.**
3. Sur GitHub : **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
   - Name : `CLAUDE_CODE_OAUTH_TOKEN` ;
   - Secret : colle le token ;
   - **Add secret**.
4. Crée `.github/workflows/claude-review.yml` (copie celui de test-claude), dans une branche, via une PR.

**Pourquoi un secret GitHub ?** Le workflow lit `${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`. GitHub injecte la valeur au moment de l'exécution et la masque dans les logs. Le token n'apparaît jamais dans le code.

### Bonus : ajouter de la CD (déploiement)

Pour un site, le plus simple est de connecter le dépôt à **Vercel** ou **Netlify** depuis leur interface :
- chaque PR obtient une URL de prévisualisation ;
- chaque fusion sur `main` déploie en production.

Pour un déploiement maison, on ajoute un workflow déclenché par `on: push: branches: [main]` et un job `deploy` qui dépend de la CI (`needs: ci`).

---

## 6. Le workflow au quotidien

### Le cycle complet

```bash
# 1. Partir d'un main à jour
git switch main
git pull

# 2. Créer une branche
git switch -c feat/ajout-moyenne-ponderee

# 3. Coder, puis commiter (les hooks se lancent tout seuls)
git add src/math.ts src/math.test.ts
git commit -m "feat(math): add weighted average"

# 4. (Optionnel) Revue locale dans Claude Code avant de pousser
#    /code-review      -> bugs et qualité
#    /security-review  -> failles

# 5. Pousser et ouvrir la PR
git push -u origin HEAD
gh pr create --fill

# 6. Suivre les checks
gh pr checks --watch

# 7. Corriger si besoin : nouveau commit, nouveau push, les checks se relancent

# 8. Fusionner quand tout est vert
gh pr merge --squash

# 9. Revenir sur main
git switch main && git pull
```

### Nommer ses branches

| Préfixe | Usage | Exemple |
|---|---|---|
| `feat/` | Nouvelle fonctionnalité | `feat/login-google` |
| `fix/` | Correction de bug | `fix/crash-panier-vide` |
| `refactor/` | Réorganisation sans changer le comportement | `refactor/extract-api-client` |
| `chore/` | Maintenance (config, dépendances) | `chore/update-eslint` |
| `docs/` | Documentation | `docs/readme-install` |
| `test/` | Tests | `test/math-edge-cases` |

### Conventional Commits

Format : `type(scope): description`, en minuscules, à l'impératif, court.

```
feat(auth): add Google sign-in
fix(cart): prevent crash on empty cart
refactor(api): extract HTTP client
chore(deps): bump eslint to v10
ci: add CodeQL check to ruleset
docs: explain local setup in README
```

Pourquoi c'est utile :
- l'historique se lit d'un coup d'œil ;
- des outils peuvent générer automatiquement un CHANGELOG et le numéro de version ;
- avec le squash merge, **le titre de la PR devient le commit sur `main`** : donne donc à ta PR un titre au format Conventional Commits.

### Une bonne PR

- **Petite** : une seule chose à la fois. Une PR de 50 lignes est relue sérieusement, une PR de 2000 lignes est survolée.
- **Un titre clair** au format Conventional Commits.
- **Une description** qui répond à trois questions : quoi, pourquoi, comment tester.
- **En brouillon** (`gh pr create --draft`) tant qu'elle n'est pas prête : ça évite de lancer la review Claude pour rien. Passe-la en "Ready for review" quand c'est prêt.

---

## 7. Lire et réagir aux résultats

### Où regarder sur GitHub

| Onglet | Ce qu'on y trouve |
|---|---|
| **Pull requests** > ta PR > **Conversation** | Commentaires, review Claude, état des checks (en bas) |
| **Pull requests** > ta PR > **Files changed** | Le diff, avec les commentaires en ligne |
| **Pull requests** > ta PR > **Checks** | Le détail de chaque check |
| **Actions** | Historique de tous les workflows, avec leurs logs |
| **Security** > Code scanning | Alertes CodeQL |
| **Security** > Dependabot | Dépendances vulnérables |
| **Security** > Secret scanning | Secrets détectés |
| **Insights** > Dependency graph > Dependabot | État des mises à jour Dependabot |

### Un check est rouge : la méthode

1. Clique sur **Details** à côté du check rouge.
2. Déplie l'étape en rouge et lis **la première erreur**, pas la dernière : les suivantes en découlent souvent.
3. Reproduis en local avec la même commande (`npm ci`, `npm run lint`...).
4. Corrige, commite, pousse. Le check se relance tout seul.

En ligne de commande :

```bash
gh pr checks                  # État des checks
gh run view <id> --log-failed # Logs des étapes en échec
```

### Une alerte CodeQL

1. Ouvre l'alerte (lien dans la PR, ou onglet **Security**).
2. Lis le **chemin de la donnée** : CodeQL montre la source (l'entrée utilisateur) et le sink (l'endroit dangereux).
3. Lis "Show more" : la doc explique la faille et propose une correction.
4. Corrige le code. Ne "dismiss" (ignore) une alerte que si tu es **certain** que c'est un faux positif, et écris pourquoi.

### Une remarque de Claude

- **Pertinente** : corrige, puis clique sur **Resolve conversation**.
- **Bonne idée, mais hors sujet** : réponds dans la discussion ("traité dans une PR dédiée"), crée une issue si besoin, puis résous.
- **Fausse** : réponds en expliquant pourquoi, puis résous. L'IA se trompe parfois : tu restes responsable de la décision.

---

## 8. Ce qu'on a vu en vrai sur test-claude

### Cas 1 : Dependabot propose une mise à jour qui casse tout (PR #1)

- Dependabot a proposé TypeScript 6 vers **7**.
- La CI a échoué sur `npm ci` avec l'erreur `ERESOLVE`, parce que typescript-eslint n'accepte pas encore TypeScript 7.
- Grâce au ruleset, la fusion était **impossible**. Sans protection, le lint aurait été cassé pour tout le monde.
- Solution : on a fermé la PR et dit à Dependabot d'ignorer les versions majeures de TypeScript (PR #3).

**Leçon** : une mise à jour majeure (`6.x` vers `7.x`) peut casser la compatibilité. C'est le sens du **versionnage sémantique (semver)** : `MAJEUR.MINEUR.CORRECTIF`. Les versions mineures et les correctifs sont censés être sans risque. Les versions majeures se font à la main, en lisant le guide de migration.

### Cas 2 : la review Claude repère un doublon et une incohérence (PR #2)

- `/install-github-app` a ajouté un workflow de review qui faisait doublon avec le nôtre : on l'a retiré.
- Claude a signalé que `claude.yml` utilisait `checkout@v4` alors que les autres workflows utilisaient la v7 : on a aligné.
- Claude a aussi recommandé d'**épingler les actions par SHA** (voir le glossaire). Bon conseil, reporté dans une PR dédiée.
- Claude a douté que `checkout@v7` existe : c'était **faux**, on l'a vérifié. Une IA peut se tromper.

### Cas 3 : une faille volontaire (PR #4)

```ts
const expression = url.searchParams.get('expr') ?? '0';
const result: unknown = eval(expression);
```

N'importe qui pouvait appeler `/?expr=require('child_process').execSync('rm -rf /')` et exécuter des commandes sur le serveur. C'est une **RCE** (Remote Code Execution), la faille la plus grave qui existe.

| Vérification | Résultat | Pourquoi |
|---|---|---|
| CI | Vert | Le code est syntaxiquement valide et les tests passent |
| CodeQL | **Rouge**, alerte **critique** "Code injection" | Il a suivi la donnée de `request.url` jusqu'à `eval` |
| Claude | "A corriger avant merge" | Il a vu la RCE, plus d'autres soucis : pas de gestion d'erreur, boucle infinie possible |
| Fusion | **Bloquée** | Le ruleset exige CodeQL sans alerte élevée ou critique |

**Leçon** : la CI vérifie que le code **fonctionne**, pas qu'il est **sûr**. C'est pour ça qu'on empile les outils.

---

## 9. Erreurs fréquentes et solutions

| Problème | Cause | Solution |
|---|---|---|
| `push declined due to repository rule violations` | Tu pousses directement sur `main` | Crée une branche et ouvre une PR |
| Le check `ci` n'apparaît pas dans "Add checks" | Il n'a jamais tourné | Pousse une première fois, puis reviens |
| PR "BLOCKED" alors que tout est vert | Discussion non résolue, ou branche pas à jour | Résous les discussions ; clique sur **Update branch** |
| Le commit est refusé par gitleaks | Un secret est dans tes fichiers | Retire-le, mets-le dans `.env` (ignoré par git), et **révoque-le** s'il a déjà été poussé |
| `gitleaks: command not found` au commit | gitleaks n'est pas installé sur la machine | `brew install gitleaks` |
| `npm ci` échoue en CI mais `npm install` marche en local | `package-lock.json` pas à jour ou pas commité | `npm install`, puis commite le lockfile |
| `could not read Username for 'https://github.com'` | Git n'a pas d'identifiants | `gh auth setup-git` |
| La review Claude ne se lance pas | PR en brouillon, ou secret manquant | Passe la PR en "Ready for review" ; vérifie dans Settings > Secrets |

**Si un secret a fuité** (poussé sur GitHub) : le supprimer du code ne suffit **pas**, il reste dans l'historique. Il faut **révoquer** la clé chez le fournisseur et en générer une nouvelle. C'est la seule vraie solution.

---

## 10. Exercices pratiques

Fais-les dans l'ordre, sur un **nouveau** dépôt public `exercice-ci`, sans regarder test-claude sauf si tu bloques.

**Exercice 1 : setup local**
Crée le projet (section 5, étapes 1 et 2). Écris une fonction `isEven(n)` et son test.
Validation : `npm run lint && npm run typecheck && npm test` passent.

**Exercice 2 : le hook bloque un secret**
Crée un fichier avec une fausse clé, par exemple `const key = "ghp_` suivi de 36 lettres et chiffres `"`, puis essaie de le commiter.
Validation : le commit est refusé. Supprime ensuite le fichier.

**Exercice 3 : première CI**
Écris `ci.yml`, crée le dépôt sur GitHub et pousse.
Validation : onglet Actions, le workflow CI est vert.

**Exercice 4 : sécurité et ruleset, à la main sur le site**
Fais les étapes 5, 6 et 7 de la section 5 **en cliquant**, sans `gh`.
Validation : `git push` direct sur `main` est refusé.

**Exercice 5 : une PR qui casse la CI**
Sur une branche `fix/test-casse`, modifie `isEven` pour qu'elle renvoie toujours `true`, puis ouvre une PR.
Validation : `ci` est rouge et le bouton de fusion est bloqué. Lis le log d'erreur, corrige, et observe le check repasser au vert.

**Exercice 6 : une faille détectée par CodeQL**
Sur une branche, recrée le serveur avec `eval` de la section 8.
Validation : alerte CodeQL critique visible dans la PR et dans Security. Ferme la PR sans fusionner.

**Exercice 7 : Dependabot**
Ajoute `dependabot.yml`, puis va dans **Insights** > **Dependency graph** > **Dependabot** et clique sur **Check for updates**.
Validation : une PR de Dependabot apparaît. Analyse-la : version mineure ou majeure ? Fusionner ou non ?

**Exercice 8 : review Claude**
Installe la review Claude (section 5, étape 8). Ouvre une PR avec un code volontairement maladroit : fonction trop longue, variable mal nommée, cas limite oublié.
Validation : Claude commente. Pour chaque remarque, décide de corriger, de reporter ou de contester, et justifie ta décision.

**Exercice 9 (avancé) : épingler les actions par SHA**
Remplace `actions/checkout@v7` par `actions/checkout@<sha-du-commit>  # v7.0.1`.
Pour trouver le SHA : `gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq .object.sha`.
Validation : la CI passe toujours, et Dependabot continue de proposer les mises à jour.

---

## 11. Glossaire

| Terme | Définition |
|---|---|
| **Action** | Brique réutilisable dans un workflow GitHub (`uses: actions/checkout@v7`) |
| **Branche** | Ligne de développement parallèle à `main` |
| **Check** | Résultat d'une vérification affiché sur une PR (vert, rouge, en cours) |
| **CI / CD** | Intégration continue (vérifier automatiquement) / Livraison continue (déployer automatiquement) |
| **CVE** | Identifiant public d'une faille connue (ex : CVE-2024-12345) |
| **Diff** | Les lignes ajoutées et supprimées par une modification |
| **Faux positif** | Alerte d'un outil sur un code qui n'est en réalité pas dangereux |
| **Hook Git** | Script lancé automatiquement par Git à un moment précis (pre-commit, pre-push) |
| **Lint** | Analyse du code pour détecter erreurs et mauvaises pratiques, sans l'exécuter |
| **Lockfile** | `package-lock.json` : versions exactes de toutes les dépendances installées |
| **Merge / Squash merge** | Fusionner une branche / la fusionner en un seul commit |
| **Moindre privilège** | Ne donner à un outil que les droits strictement nécessaires |
| **Push protection** | Blocage d'un push qui contient un secret |
| **RCE** | Remote Code Execution : un attaquant exécute du code sur ton serveur |
| **Review** | Relecture du code d'une PR avant fusion |
| **Ruleset** | Ensemble de règles GitHub appliquées à des branches |
| **Runner** | Machine qui exécute un workflow GitHub Actions |
| **SAST** | Analyse statique de sécurité (lire le code pour trouver des failles) : CodeQL, Semgrep |
| **Secret** | Donnée sensible : clé API, token, mot de passe |
| **Semver** | Versionnage `MAJEUR.MINEUR.CORRECTIF` : seul un MAJEUR peut casser la compatibilité |
| **SHA (épinglage)** | Identifiant unique et immuable d'un commit. Un tag `@v7` peut être déplacé par son auteur (ou par un attaquant qui a piraté son compte), un SHA non : épingler par SHA protège contre ce type d'attaque sur la chaîne d'approvisionnement |
| **Sink / Source** | Pour CodeQL : endroit dangereux (`eval`, SQL) / origine d'une donnée non fiable (requête HTTP) |
| **Workflow** | Fichier YAML dans `.github/workflows/` qui décrit une automatisation |

---

## Pour aller plus loin

- GitHub Actions : https://docs.github.com/actions
- Rulesets : https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets
- CodeQL : https://docs.github.com/code-security/code-scanning
- Dependabot : https://docs.github.com/code-security/dependabot
- Conventional Commits : https://www.conventionalcommits.org/fr/
- Claude Code Action : https://github.com/anthropics/claude-code-action
- OWASP Top 10, les failles web les plus courantes : https://owasp.org/Top10/fr/
