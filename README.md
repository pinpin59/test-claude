# test-claude

Dépôt de test pour un workflow propre : branches, pull requests, CI et vérifications de sécurité automatiques.

## Installation

```bash
nvm use        # Node 22 (voir .nvmrc)
npm install    # installe aussi les hooks git (husky)
brew install gitleaks
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification des types TypeScript |
| `npm test` | Tests Vitest |

## Workflow

`main` est protégée : on n'y pousse jamais directement, tout passe par une PR.

1. Créer une branche : `git switch -c feat/ma-feature`
2. Committer en [Conventional Commits](https://www.conventionalcommits.org/fr/) (`feat: ...`, `fix: ...`)
3. Avant de pousser, faire une revue locale dans Claude Code : `/code-review` puis `/security-review`
4. Pousser et ouvrir la PR : `git push -u origin HEAD && gh pr create --fill`
5. Attendre que tout soit au vert, corriger si besoin, puis fusionner : `gh pr merge --squash`

## Vérifications

| Quand | Outil | Vérifie |
|---|---|---|
| Commit (local) | gitleaks | Aucun secret (clé API, mot de passe) dans le commit |
| Commit (local) | lint-staged + ESLint | Les fichiers modifiés respectent les règles |
| Push | GitHub push protection | Bloque un push qui contient un secret connu |
| PR | CI (`ci.yml`) | Lint, types, tests |
| PR | CodeQL | Failles de sécurité dans le code |
| PR | Claude (`claude-review.yml`) | Review qualité, bugs et sécurité, commentée sur la PR |
| Chaque semaine | Dependabot | Dépendances vulnérables ou obsolètes |

Une PR ne peut être fusionnée que si les checks `ci` et `CodeQL` passent.
