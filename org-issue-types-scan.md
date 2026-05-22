# Evolution-Perspectives Org Issue Types Scan

Captured on: 2026-04-29

Source: GitHub organization issue types (`Evolution-Perspectives`)

## Inventory

| Name                       | Description                                                                                                              | Enabled | ID                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------- |
| Tâche                      | Tâche opérationnelle à exécuter                                                                                          | Yes     | `IT_kwDOCIcusc4BNM3f` |
| Bug                        | Comportement non prévu/incorrect ou défaut à corriger.                                                                   | Yes     | `IT_kwDOCIcusc4BNM3j` |
| Fonctionnalité             | Nouvelle fonctionnalité ou évolution produit.                                                                            | Yes     | `IT_kwDOCIcusc4BNM3l` |
| Développement/Production   | Exécution opérationnelle : réalisation des actions planifiées et passage en production/mise en service selon le contexte | Yes     | `IT_kwDOCIcusc4B4kdT` |
| Métier                     | Tâche effectuée par le coeur de métier                                                                                   | Yes     | `IT_kwDOCIcusc4B4kd4` |
| Test/Validation            | Vérification qualité, tests de fonctionnalité, validation fonctionnelle/technique                                        | Yes     | `IT_kwDOCIcusc4B4kkh` |
| Support                    | Assistance utilisateur, aide ponctuelle sur un fonctionnement ou correction rapide non structurante.                     | Yes     | `IT_kwDOCIcusc4B4knB` |
| Externe                    | Sujet dépendant d’un client/prestataire/partenaire externe.                                                              | Yes     | `IT_kwDOCIcusc4B4knI` |
| Recherche/Veille technique | Analyse technique en amont en vue de la production, étude de l'existant, évaluation des impacts                          | Yes     | `IT_kwDOCIcusc4B4kr-` |
| Specs/Cahier des charges   | Rédaction/affinage des besoins et cadrage fonctionnel.                                                                   | Yes     | `IT_kwDOCIcusc4B4lwK` |
| Management/Direction       |                                                                                                                          | Yes     | `IT_kwDOCIcusc4B5VS2` |
| Projet                     | Ensemble d'issues correspondant à une iteration, un projet, un objectif clair, avec un début et une fin                  | Yes     | `IT_kwDOCIcusc4B64Nz` |

## First Observations

1. The current issue types mix several different concepts in one taxonomy.
2. Some types describe nature of work: `Bug`, `Fonctionnalité`, `Tâche`.
3. Some types describe delivery phase or execution mode: `Développement/Production`, `Test/Validation`, `Recherche/Veille technique`, `Specs/Cahier des charges`.
4. Some types describe context or source of dependency: `Support`, `Externe`, `Métier`, `Management/Direction`.
5. `Projet` is different from the others because it describes a higher planning level rather than a work activity type.

## Design Tension Exposed By This Scan

The issue type system is already trying to express at least four axes at once:

1. Work kind
2. Delivery phase
3. Organizational context
4. Planning level

That is important for the future operating model because a single issue type field may not be enough to cleanly represent all of those concerns at the same time.

## Assignation

This chapter defines what an assignment means depending on the level of the issue in the hierarchy.

Core distinction:

1. Leaf assignment = execution ownership
2. Non-leaf assignment = coordination ownership

Non-leaf assignments should only exist when they reflect a real responsibility at that level of the hierarchy. They should not be bulk copies of assignees coming from child issues.

Leaf issue semantics:

1. A leaf issue in `Backlog` may still be raw material, notes, or an undecomposed action candidate.
2. A leaf issue outside `Backlog` should represent a concrete action performed by one accountable person.

### Rule 1: One assignee per leaf level issue

Only leaf-level issues should represent direct executable work. A leaf issue may remain unassigned while it is still in `Backlog`, but once it leaves `Backlog` it should have exactly one accountable assignee.

Implications:

1. A backlog leaf may be used as structured raw material before execution ownership is clear.
2. Once a leaf issue becomes `Ready`, `In progress`, or any other execution state, it should stop being a note and become a real action owned by one person.
3. Parent issues should not be used as shared execution buckets.
4. If work truly requires several people working in parallel, it should usually be split into several leaf issues under the same parent.
5. Parent dates, estimates, and progress should be derived from leaf issues rather than manually maintained as execution truth.
6. A single accountable assignee at leaf level is the foundation for realistic capacity planning, forecasting, and delivery accountability.

### Rule 4: Non-leaf assignment means coordination ownership, not execution ownership

When an issue has children, any assignment on that non-leaf issue should represent coordination responsibility rather than direct execution ownership.

Implications:

1. Leaf assignments represent who executes the work.
2. Non-leaf assignments represent who steers, coordinates, or owns the workstream.
3. Non-leaf issues should usually have either zero assignee or one coordinator owner, not several execution-style assignees.
4. Parent assignments must not be used for capacity calculations or as a substitute for assigning the underlying leaf work.
5. Parent issues should not inherit child assignees automatically, because execution participation at child level is not the same thing as responsibility at parent level.

## Planning Data Ownership

This chapter defines which planning fields are human-owned and which ones are derived from the hierarchy.

### Rule 2: Only leaf-level issues are manually estimated

Manual estimation should exist only on leaf-level issues. Every parent issue should derive its estimate from the sum or rollup of its descendant leaf issues.

Implications:

1. Parent estimates should not be manually edited once child issues exist.
2. Project-, chapter-, and big-task-level estimates should be treated as computed planning outputs rather than human-entered execution truth.
3. If a parent estimate feels impossible to explain from its children, that is a decomposition problem rather than a reason to override the rollup manually.
4. Forecast quality depends first on leaf quality: if leaf estimates are weak or missing, parent estimates and dates become weak automatically.

### Rule 3: Parent dates are derived, not manually owned

Parent-level start and end dates should be computed from descendant leaf issues rather than manually maintained as if parent issues were directly executed themselves.

Implications:

1. A parent start date should reflect the earliest relevant descendant work start.
2. A parent end date should reflect the latest relevant descendant work end.
3. Parent dates should be treated as rollup indicators for planning and reporting, not as manually curated promises disconnected from actual child execution.
4. If parent dates look wrong, the first question should be whether the child hierarchy, assignments, or leaf estimates are wrong.

## Priority

This chapter defines what priority means in the future operating model.

Core distinction:

1. Priority is a planning decision, not a status.
2. Priority should be applied after qualification, when the issue has become understandable enough to arbitrate honestly.
3. Non-leaf priority reflects business or coordination importance.
4. Leaf priority reflects execution order only when useful.

Current priority meanings:

1. `🔥 Urgent` = Situation exceptionnelle nécessitant une prise en charge immédiate.
2. `⚡ Important` = À traiter avant le reste pour garantir l'avancement global.
3. `🌿 Planifié` = Travail normal organisé et prévu dans le flux de production.
4. `💧 Secondaire` = À traiter quand possible, lorsqu'une fenêtre se présente.
5. `🪼 Optionnel` = Amélioration bonus, à faire à l'occasion.

Usage rules:

1. `🔥 Urgent` should remain exceptional and should normally correspond to an interruption of the normal flow.
2. `⚡ Important` should mean "before the rest" to protect a broader objective, not merely "valuable" or "interesting".
3. `🌿 Planifié` should be the default value for normal committed work in the expected production flow.
4. `💧 Secondaire` should not compete with already committed planned work unless a real execution window appears.
5. `🪼 Optionnel` should remain genuinely droppable without material delivery impact.

### Rule 5: Priority is not a workflow status

An issue should not move through dedicated statuses such as `Assigned`, `Prioritized`, or `Estimated`. Priority should remain a field-based planning signal that influences decisions without becoming a lane on the board.

Implications:

1. The lifecycle should answer where the work is, not whether priority has already been discussed.
2. A leaf issue may be assigned or estimated without changing status.
3. Priority should help determine what becomes `Ready` and what gets started next, rather than create an additional workflow step on the board.

### Rule 6: Priority should be meaningful at the level where arbitration happens

Priority should be applied first at the smallest level where teams or managers truly arbitrate capacity, then refined at leaf level when execution order matters.

Implications:

1. Backlog raw material may remain unprioritized until qualification clarifies what it actually is.
2. A `Projet`, chapter, or big task may carry priority when it competes for organizational attention.
3. A leaf issue may carry priority when it competes with other leaf issues for an executor's next action.
4. Priority should not be sprayed uniformly across every level if nobody is making decisions at that level.
5. If one single priority field must be used initially, it should be interpreted carefully: strategic arbitration on non-leaves, execution sequencing on leaves.

### Rule 7: Priority propagation should remain simple and GitHub-native

For now, the system must not rely on a locked-priority mechanism or hidden override memory. Priority behavior must stay based on visible project values only.

Implications:

1. When a child issue is created, it must inherit the current parent priority as its initial default.
2. After creation, automatic propagation must remain parent-to-child only.
3. When a parent priority is raised, descendant issues with a lower priority must be recursively raised to the new parent level.
4. `💧 Secondaire` and `🪼 Optionnel` must be excluded from automatic escalation.
5. When a parent priority is lowered, descendant issues with a higher priority must be recursively downgraded to the new parent level.
6. Descendant issues already at or below the new downgraded parent priority must remain unchanged.
7. Child-to-parent priority changes must not propagate automatically.
8. Until a dedicated override or lock mechanism exists, the model must assume transparent simple rules rather than hidden exceptions.

Priority propagation summary:

1. At child creation, parent priority becomes the child's initial default.
2. Priority propagation is top-down only.
3. When a parent priority is raised, it acts as a floor: lower-priority descendants must rise to that level, except `💧 Secondaire` and `🪼 Optionnel`.
4. When a parent priority is lowered, it acts as a ceiling: higher-priority descendants must fall to that level, while descendants already at or below that level stay unchanged.
