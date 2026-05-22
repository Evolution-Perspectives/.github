# Spec - Formulaire Nouvelle Page Web

![Scope](https://img.shields.io/badge/Scope-hubspot--theme-1f6feb?style=for-the-badge)
![Workflow](https://img.shields.io/badge/Workflow-Automatise-0a7ea4?style=for-the-badge)
![Naming](https://img.shields.io/badge/Naming-Obligatoire-8a2be2?style=for-the-badge)
![Status](https://img.shields.io/badge/Statut-Reference%20active-2ea043?style=for-the-badge)

## Contexte

Cette spec decrit le formulaire cible et les regles d'automatisation associees pour le repo hubspot-theme.

## Objectif

Capturer une demande de nouvelle page web de facon standardisee, puis creer automatiquement les sous-issues necessaires.

> [!IMPORTANT]
> Cette spec sert de reference unique pour la creation du parent, des subissues, des dependances et des types d'issues.

## Formulaire cible

Nom du formulaire: Nouvelle Page Web

| Champ                                      | Type                 | Valeurs / Regles                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type de page                               | Liste deroulante     | Landing Page, Page Web                                                                                                                                                                                                                                                                                                                                                |
| Site                                       | Liste deroulante     | EP, HEDC, HECI, HEFC, Way2Be, Autre                                                                                                                                                                                                                                                                                                                                   |
| Nom de la page                             | Single line text     | Obligatoire                                                                                                                                                                                                                                                                                                                                                           |
| Description                                | Texte libre Markdown | Optionnel                                                                                                                                                                                                                                                                                                                                                             |
| Prio                                       | Liste deroulante     | 🔥Urgent - Situation exceptionnelle nécessitant une prise en charge immédiate; ⚡Important - À traiter avant le reste pour garantir l'avancement global; 🌿 Planifié - Travail normal organisé et prévu dans le flux de production; 💧 Secondaire - À traiter quand possible, lorsqu'une fenêtre se présente; 🪼 Optionnel - Amélioration bonus, à faire à l'occasion |
| Cette page doit etre un template ?         | Checkbox             | Defaut non coche                                                                                                                                                                                                                                                                                                                                                      |
| Cette page necessite de nouveaux modules ? | Checkbox             | Defaut non coche                                                                                                                                                                                                                                                                                                                                                      |
| Kickoff necessaire ?                       | Checkbox             | Defaut non coche                                                                                                                                                                                                                                                                                                                                                      |

Interpretation des checkboxes:

- Coche = Oui
- Non coche = Pas pour le moment

> [!TIP]
> Garder les checkboxes non cochees par defaut pour limiter le bruit et ne creer que les subissues vraiment necessaires.

Regles du champ Prio:

- Reprendre exactement les termes de base existants du champ Prio du project, avec leur explication directement dans la valeur affichée.
- Valeur par defaut: 🌿 Planifié.
- Application uniquement sur l'issue parente.

Regles du champ Kickoff necessaire:

- Valeur par defaut: Non.
- Si coche, l'automatisation cree automatiquement une subissue Kickoff.
- La subissue Kickoff bloque toutes les autres subissues par defaut.

## Titre parent

Format cible:

- Nouvelle [Type de page] [Site] [Nom de la page]

Type d'issue:

- Projet

Note:

- Si necessaire, le titre peut etre reconstruit ou normalise automatiquement via workflow apres creation.

## Convention de nommage (obligatoire)

Le naming de chaque subissue suit obligatoirement ce format:

- Page [Nom de la page] - [Nom de la subissue]

Exemples:

- Page [Nom de la page] - Preconisations marketing
- Page [Nom de la page] - Maquettage
- Page [Nom de la page] - Contenus

> [!NOTE]
> La convention de nommage est obligatoire et doit rester stable pour faciliter le tracking, la recherche et l'automatisation.
>
> Regle de cadrage des types:
> Dans ce workflow, ne pas utiliser le type Metier pour les subissues.
> Le type Metier reste reserve aux sujets metier transverses qui ne sont pas encore transformes en travail de specs ou de production.

## Regles de creation des subissues

Subissues toujours creees:

1. Preconisations marketing
2. Maquettage
3. Contenus
4. Integration
5. Validation/Test
6. Publication

Subissues conditionnelles:

1. Si Kickoff necessaire est coche -> creer Kickoff
2. Si template est coche -> creer Production du template
3. Si nouveaux modules est coche -> creer Nouveau(x) module(s)

## Ordonnancement reel du travail

1. L'equipe marketing produit les preconisations.
2. En parallele, l'equipe avance sur Maquettage et Contenus.
3. Si necessaire, l'equipe produit ensuite Production du template et Nouveau(x) module(s).
4. L'equipe passe ensuite a l'Integration.
5. L'equipe effectue ensuite la Validation/Test.
6. L'equipe termine par la Publication.

## Vue des dependances

```mermaid
flowchart TD
	K[Kickoff - optionnelle]
	A[Preconisations marketing]
	B[Maquettage]
	C[Contenus]
	D[Production du template - optionnelle]
	E[Nouveau(x) module(s) - optionnelle]
	F[Integration]
	G[Validation/Test]
	H[Publication]

	K --> A
	K --> B
	K --> C
	K --> D
	K --> E
	K --> F
	K --> G
	K --> H

	A --> B
	A --> C
	B --> D
	B --> E
	C --> F
	D --> F
	E --> F
	F --> G
	G --> H

	classDef prep fill:#dbeafe,stroke:#1d4ed8,color:#0f172a,stroke-width:1px;
	classDef prod fill:#ede9fe,stroke:#6d28d9,color:#0f172a,stroke-width:1px;
	classDef ship fill:#dcfce7,stroke:#15803d,color:#0f172a,stroke-width:1px;

	class A,B,C prep;
	class D,E,F prod;
	class G,H ship;
```

> [!WARNING]
> Integration ne doit pas demarrer tant que Contenus n'est pas termine et que les subissues conditionnelles presentes ne sont pas terminees.

## Sequence d'automatisation

1. L'utilisateur soumet le formulaire.
2. L'issue parent est creee.
3. L'automatisation lit les champs du formulaire.
4. Si Kickoff necessaire est coche, l'automatisation cree la subissue Kickoff en premier.
5. L'automatisation cree les 6 subissues de base.
6. L'automatisation cree les subissues conditionnelles selon les checkboxes.
7. Si la subissue Kickoff existe, l'automatisation applique les blocages Kickoff vers toutes les autres subissues.
8. Les subissues sont liees a l'issue parent.
9. Les blocages sont appliques entre subissues selon les regles ci-dessous.

## Detail des subissues

### Kickoff (conditionnelle)

Type d'issue:

- Direction/management

Bloquee par:

- Aucune

Condition de creation:

- Creee uniquement si Kickoff necessaire est coche

Objectif:

- Valider le cadrage de haut niveau avant demarrage du reste du flux

Contenu attendu:

- Contexte et objectifs valides
- Priorites et perimetre valides
- Decision Go/No-Go explicite

Sortie attendue:

- Validation de lancement permettant de debloquer toutes les autres subissues

### 1) Preconisations marketing

Type d'issue:

- Specs/Cahier des charges

Bloquee par:

- Aucune

Objectif:

- Definir l'angle marketing de la page et les messages cles

Contenu attendu:

- Cible principale
- Proposition de valeur
- Messages cles et CTA

Sortie attendue:

- Recommandations marketing validees pour alimenter le maquettage et les contenus

### 2) Maquettage

Type d'issue:

- Specs/Cahier des charges

Bloquee par:

- Preconisations marketing

Objectif:

- Produire la maquette de reference de la page

Contenu attendu:

- Structure de page
- Hierarchie visuelle
- Comportement desktop/mobile

Sortie attendue:

- Maquette validee prete pour integration

### 3) Nouveau(x) module(s) (conditionnelle)

Type d'issue:

- Developpement/Production

Bloquee par:

- Maquettage

Condition de creation:

- Creee uniquement si cette page necessite de nouveaux modules est coche

Objectif:

- Concevoir et livrer les modules HubSpot manquants

Contenu attendu:

- Liste des nouveaux modules
- Specifications fonctionnelles
- Etats et variantes necessaires

Sortie attendue:

- Modules disponibles et testables pour l'integration

### 4) Production du template (conditionnelle)

Type d'issue:

- Developpement/Production

Bloquee par:

- Maquettage

Condition de creation:

- Creee uniquement si cette page doit etre un template est coche

Objectif:

- Construire le template reutilisable de la page

Contenu attendu:

- Structure template
- Zones editables
- Contraintes d'usage

Sortie attendue:

- Template utilisable pour de futures pages

### 5) Contenus

Type d'issue:

- Developpement/Production

Bloquee par:

- Preconisations marketing

Objectif:

- Produire et valider les contenus editoriaux de la page

Contenu attendu:

- Titres, textes, CTA
- Medias necessaires
- Version finale relue

Sortie attendue:

- Contenus finalises prets pour integration

### 6) Integration

Type d'issue:

- Developpement/Production

Bloquee par:

- Contenus
- Production du template (si cette subissue existe)
- Nouveau(x) module(s) (si cette subissue existe)

Objectif:

- Integrer la page dans HubSpot en respectant maquette et contenus

Contenu attendu:

- Assemblage des modules
- Styles et responsiveness
- Connexion des elements dynamiques si necessaire

Sortie attendue:

- Page integree prete pour recette

### 7) Validation/Test

Type d'issue:

- Test/Validation

Bloquee par:

- Integration

Objectif:

- Verifier que la page est conforme fonctionnellement et visuellement

Contenu attendu:

- Verification desktop/mobile
- Verification liens/CTA
- Verification performance de base

Sortie attendue:

- Liste d'anomalies traitee ou acceptee avant publication

### 8) Publication

Type d'issue:

- Release/Mise en production

Bloquee par:

- Validation/Test

Objectif:

- Mettre la page en ligne dans les conditions prevues

Contenu attendu:

- Checklist pre-publication
- Date ou fenetre de mise en ligne
- Verification post-publication

Sortie attendue:

- Page publiee et confirmee en production
