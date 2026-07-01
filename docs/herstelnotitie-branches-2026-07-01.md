# Herstelnotitie branches main/staging

Datum: 1 juli 2026  
Werkbranch: `work`

## Uitgevoerde opdracht

De gevraagde lokale ref-refresh is uitgevoerd met:

```bash
git fetch --all --prune
```

## Belangrijke beperking

Deze checkout heeft lokaal geen remote `origin` geconfigureerd. De lokale `.git/config` bevat alleen de core-repositoryconfiguratie en `git remote -v` geeft geen remotes terug. Daardoor bestaan `origin/main` en `origin/staging` in deze werkomgeving niet als refs.

Gevolg: de gevraagde SHA's en branchvergelijkingen kunnen lokaal niet betrouwbaar worden vastgesteld zonder eerst de juiste GitHub-remote te configureren of nieuwe refs aan te leveren.

## Gevraagde SHA's

| Ref | Status | SHA |
| --- | --- | --- |
| `origin/main` | Niet aanwezig in lokale checkout | Niet vast te stellen |
| `origin/staging` | Niet aanwezig in lokale checkout | Niet vast te stellen |

Lokale HEAD ter context:

```text
cc0c1674bc4110d330bf012f9f4a39b9f6d550a2 refs/heads/work
```

## Gevraagde vergelijkingscommando's

### `git log --oneline --graph --decorate origin/main origin/staging --max-count=100`

Resultaat in deze checkout:

```text
fatal: ambiguous argument 'origin/main': unknown revision or path not in the working tree.
```

### `git diff --stat origin/main..origin/staging`

Niet uitvoerbaar, omdat `origin/main` en `origin/staging` ontbreken.

### `git diff --stat origin/staging..origin/main`

Niet uitvoerbaar, omdat `origin/staging` en `origin/main` ontbreken.

## Lokale branch-/refstatus

```text
$ git remote -v
# geen output

$ git branch -a
* work

$ git show-ref --heads --tags --dereference | head -100
cc0c1674bc4110d330bf012f9f4a39b9f6d550a2 refs/heads/work
```

## PR-classificatie

Omdat `origin/main` en `origin/staging` ontbreken, kan niet worden bewezen welke PR's alleen op `staging`, alleen op `main`, of op beide branches staan.

| Categorie | PR's | Zekerheid |
| --- | --- | --- |
| Alleen op `staging` | Niet vast te stellen | Geen `origin/staging` ref beschikbaar |
| Alleen op `main` | Niet vast te stellen | Geen `origin/main` ref beschikbaar |
| Op beide branches | Niet vast te stellen | Beide remote refs ontbreken |

Wel zichtbaar in de lokale `work`-historie binnen de laatste 100 commits zijn onder meer mergecommits voor PR #46 t/m #65, inclusief merges vanuit `main` en `staging` in featurebranches. Deze lokale historie is onvoldoende om de huidige GitHub-branchinhoud van `main` en `staging` te bevestigen.

## Benodigde gebruikersbevestiging / vervolgstap

Bevestig welke GitHub-remote en branches leidend zijn, of configureer de remote opnieuw. Daarna moeten de gevraagde controles opnieuw worden uitgevoerd:

```bash
git remote add origin <github-url>
git fetch --all --prune
git rev-parse origin/main
git rev-parse origin/staging
git log --oneline --graph --decorate origin/main origin/staging --max-count=100
git diff --stat origin/main..origin/staging
git diff --stat origin/staging..origin/main
```
