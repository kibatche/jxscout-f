# Roadmap — port du triage JS agent-outillé dans jxscout

> Document de planification rédigé par Shevek (IA) sur mandat de kbtch_, 2026-08-01.
> Aucune ligne de code n'est produite ici : ce fichier décrit **quoi** faire et **pourquoi**,
> l'implémentation reste à kbtch_.
> Les estimations sont des fourchettes pour une session de travail réelle, pas des sprints.

---

## 0. Le constat mesuré (2026-08-01)

Toutes les mesures sur le même fichier : `~/jxscout/easyship/original/app.easyship.com/assets/index-BOqJlIgF.js`
— **10 878 143 o / 314 360 lignes**. Machine : Fedora, bun 1.3.14.

| Poste | Temps | Part du total |
|---|---:|---:|
| **Run complet, 24 analyzers** (bundle rsbuild) | **13,43 s** | 100 % |
| `parseSync` oxc seul | 1,03 s | 7,7 % |
| Walk pur, **0 analyzer** (`analyzeFile(f, [])`) | 5,56 s | 41 % |
| → dont walker maison seul (walk − parse) | ~4,5 s | 34 % |
| `secrets` seul (12,19 s − walk pur) | ~6,6 s | 49 % |
| Les 22 autres analyzers réunis | ~1,3 s | 10 % |
| **`@babel/parser` seul, même fichier** | **1,11 s** (RSS 692 Mo) | ≈ oxc |
| Démarrage runtime `bun -e ''` | 0,027 s | 0,2 % |

Quatre faits qui décident de tout ce qui suit :

1. **Le parser n'est pas le sujet.** oxc = 1,03 s, babel = 1,11 s sur le même fichier. Un écart
   de ~7 %. L'intuition « Rust donc beaucoup plus rapide » ne se vérifie pas ici, probablement
   parce que le gain natif est mangé par la sérialisation de l'AST à travers le pont napi
   (le wrapper JS d'oxc-parser fait un `JSON.parse` du programme).
2. **Le walker maison coûte 4× le parser** (~4,5 s contre 1,03 s), et il coûte ça **même avec
   zéro analyzer branché** : 5 analyzers actifs donnent 5,52 s, aucun analyzer donne 5,56 s.
   Les analyzers légers sont gratuits ; c'est la machinerie de parcours qui paie.
3. **`secrets` pèse la moitié du run** (~6,6 s) pour **3 matches** sur ce bundle : il teste
   ~1600 regex contre chaque littéral string.
4. **Le filtre existe déjà** : `analyzeFile(filePath, analyzersToRun?)` accepte une liste
   d'analyzers. Le bornage « 1 passe = 1 classe » est gratuit côté outil.

**Verdict sur « est-ce que le port babel vaut le coup » : oui.** Le seul argument contre était la
perte de perf du parser, et il est mesuré à ~7 %. En face, on supprime : 9 binaires `.node`
embarqués via `go:embed`, leur extraction runtime, la variable `NAPI_RS_NATIVE_LIBRARY_PATH`,
le patch regex post-build sur le bundle (`scripts/patch-ast-analyzer-build/patch.ts`), la
dépendance à rsbuild, et la classe entière des mismatchs wrapper-JS / binaire-natif. Et surtout
on obtient **un seul arbre partagé entre détection et taint**, ce qui est l'objet du chantier.

**Le vrai risque n'est pas le temps, c'est la mémoire** : 692 Mo de RSS pour parser ce fichier.
Avec `-ast-analyzer-concurrency 5` par défaut, cinq bundles de cette taille en parallèle
approchent 3,5 Go. Le RSS d'oxc n'a pas été mesuré — la comparaison est incomplète sur ce point.

---

## Phase 0 — Socle et filet de non-régression ✅

*Rien ne doit bouger avant d'avoir de quoi prouver que ça n'a pas cassé.*
**Faite par Shevek le 2026-08-01. Mode d'emploi complet : `scripts/regression/README.md`.**

- [x] **Peupler les dépendances du fork.** `bun install --frozen-lockfile` → `oxc-parser` en
      **0.68.1**, conforme au lock. C'était la cause de l'erreur
      `undefined is not an object (evaluating 'fixes')` : sans `node_modules/`, bun auto-résolvait
      la 0.142 depuis le cache global, dont le wrapper attend un AST que le binding 0.68 ne rend pas.
- [x] **Constituer un corpus de référence figé** → `~/jxscout-regression/corpus/`, **23 fichiers,
      30 Mo**, inventaire dans `~/jxscout-regression/MANIFEST.md`. Sélection déterministe :
      les 5 fichiers à vérité terrain connue (2 bundles Easyship portant les CSPT
      `t`@54304/54321/54579, 3 chunks Svelte de Radio France), plus une stratification par taille
      aux percentiles 10/50/90/100 sur chacun des 5 programmes réels. Couvre quatre chaînes de
      build : Vite, Next.js, Svelte, webpack. Le programme `default` est exclu (doublons de
      `sncf-connect`), et les fichiers qui ne sont pas du JavaScript aussi — voir la correction
      ci-dessous.
- [x] **Capturer la sortie JSON actuelle** → `~/jxscout-regression/baseline/`, **23/23 fichiers,
      14 960 matches, ~40 s**. Deux fichiers pèsent les deux tiers du temps : kmeet Infomaniak
      (13 Mo, ~14 s) et l'app Easyship (10,9 Mo, ~13 s).
- [x] **Écrire le comparateur de sorties** → `scripts/regression/compare.ts`, avec
      `scripts/regression/capture.ts` pour produire les captures. Le comparateur apparie d'abord
      sur contenu **et** position, puis sur contenu seul pour distinguer un *déplacement* d'une
      vraie *disparition* — un match déplacé demande vérification, un match disparu est une
      régression. Il sort en code 1 dès qu'un match disparaît.
- [x] **Documenter** → `scripts/regression/README.md` : règle de sélection du corpus, variables
      d'environnement (`JXSCOUT_REGRESSION_DIR`, `JXSCOUT_ANALYZER`, `JXSCOUT_NATIVE_PARSER`),
      pourquoi `NAPI_RS_NATIVE_LIBRARY_PATH` est indispensable au bundle et inutile au TS source,
      et les deux normalisations appliquées avant écriture.

### ⚠️ Ce que le filet a trouvé dès sa première exécution

Comparaison **bundle de production contre TS source du même dépôt** : **19 matches disparus,
0 apparu, 0 déplacé**. Tous produits par l'analyzer `graphql`, tous sur des `TemplateLiteral`,
répartis sur cinq bundles.

Le bundle rsbuild et le TS source **ne donnent donc pas le même résultat**, alors qu'ils sont
censés être le même programme. Les positions sont parfaitement stables, ce n'est donc pas un
décalage de calcul de lignes mais bien un analyzer qui se comporte autrement. Hypothèse la plus
probable, non vérifiée : le bundle embarque une version d'`oxc-parser` différente de la 0.68.1
aujourd'hui installée, et la forme de l'AST des littéraux de gabarit a changé entre les deux.

Sur le fond ces 19 matches sont des faux positifs — des sélecteurs CSS et des clés i18n pris pour
du GraphQL — donc le TS source est *plus* juste. Mais la conséquence méthodologique tient quand
même : **la référence doit rester le bundle**, puisque c'est lui que jxscout exécute.

- [ ] **Élucider l'écart bundle / source** avant de démarrer la phase 1, sans quoi on portera un
      comportement sans savoir lequel des deux est le bon. *(45 min)*

      Fausse piste écartée : `ast-analyzer.js` apparaissait modifié dans le working tree
      (324 442 octets contre 284 884 au commit). Ce n'était **pas** un rebuild avec d'autres
      dépendances, seulement une tentative de beautifier le bundle minifié pour le lire — les
      40 ko d'écart sont du blanc. Le changement a été annulé depuis. La sémantique du bundle
      étant inchangée, la baseline capturée reste valide ; le vérifier coûte une recapture et un
      `compare.ts` contre `baseline/`, qui doit sortir zéro écart. Si ce n'est pas le cas, c'est
      un résultat en soi.

      Il reste donc que l'écart bundle / TS source n'a **aucune** explication établie : les deux
      partagent le même `node_modules`, et le bundle n'a pas été reconstruit. La piste à suivre
      est ce que rsbuild fait au code de `graphql.ts` en le bundlant.

### Faut-il une branche pour comparer ?

Non. La baseline est **figée sur disque, hors du dépôt et hors de git** : elle ne dépend
d'aucun état du working tree. On ne compare pas deux versions du *code*, on compare deux
*sorties* déjà enregistrées. Le travail peut donc se faire sur `main` sans précaution
particulière — une branche reste utile pour les raisons habituelles (revenir en arrière, garder
un diff lisible), mais l'outil n'en demande pas.

**En revanche, choisir la bonne référence compte.** La baseline par défaut vient du *bundle*.
Comparer un port babel du *TS source* contre elle mélangerait deux variables : le changement de
parser, et l'écart bundle/source des 19 `graphql`. La capture `candidate-tssource/` déjà prise
est la référence à variable unique — même code source, même chaîne d'exécution, seul le parser
change. La promouvoir en référence de travail, et garder `baseline/` comme témoin du
comportement de production.

---

## Phase 1 — Port oxc → babel

*Objectif : même sortie, sans binaire natif.*

- [ ] **Cartographier l'écart de types ESTree → Babel.** Le seul type qui change de nom est
      `Literal`, que Babel éclate en `StringLiteral` / `NumericLiteral` / `RegExpLiteral` / etc.
      Cinq fichiers seulement l'utilisent : `hostname.ts`, `graphql.ts`, `robust-paths.ts`,
      `secrets.ts`, `regex-pattern.ts`. Tous les autres types employés — `CallExpression`,
      `MemberExpression`, `AssignmentExpression`, `NewExpression`, `TemplateLiteral`,
      `ObjectExpression`, `JSXElement`, `VariableDeclarator`, `BinaryExpression` — portent le
      même nom des deux côtés. Établir la table de correspondance avant de toucher au code.
      *(45 min)*
- [ ] **Remplacer `parseFile()`** (`pkg/ast-analyzer/analyzer.ts:33`) par `@babel/parser`.
      Deux morceaux de code mort à traiter, mais **pas à « réparer »** :

      Le premier est le calcul de `extension`. `let extension: "jsx" | "tsx" = "jsx"` puis
      `if (!["ts"].includes(extension)) extension = "tsx"` : la condition teste une variable qui
      vient d'être initialisée à `"jsx"`, elle est donc toujours vraie, et le type déclaré
      interdit de toute façon que `extension` vaille jamais `"ts"`. `lang` vaut **toujours
      `"tsx"`**. L'intention d'origine était visiblement de dériver l'extension du chemin du
      fichier — quelque chose comme `filePath.split(".").pop()` — et l'initialisation a dû
      disparaître dans un refactor en laissant la coquille. **Ne pas rétablir cette intention
      pendant le port** : ça ferait parser certains fichiers en `ts` au lieu de `tsx` et
      changerait la baseline. Supprimer le code mort et fixer le mode en dur, ce qui préserve
      le comportement actuel. L'équivalent babel de `lang: "tsx"` est
      `plugins: ["typescript", "jsx"]`.

      Le second est le `try/catch` autour de `parseSync`, dont le `catch` **relance exactement
      le même appel avec les mêmes options**. Ce n'est pas un fallback, c'est une répétition.
      *(1 h)*

- [ ] **Remonter les erreurs de parse.**
      Vérifié à l'exécution : `parseSync` d'oxc **ne lève pas d'exception** sur un fichier
      invalide, il retourne un tableau `errors`. Ce qui explique d'ailleurs pourquoi le
      `try/catch` ci-dessus n'a jamais rien attrapé. Or `parseFile()` renvoie
      `{ ast: parsed.program, source, filePath }` **sans jamais consulter `parsed.errors`**.
      Conséquence : un fichier qui échoue au parse produit un arbre vide ou partiel, l'analyzer
      rend zéro match, et **rien ne le signale** — ni le Go, ni la base, ni l'extension. Un
      fichier non analysable est aujourd'hui indistinguable d'un fichier propre.
      Ça vaut pour le port babel aussi, avec `errorRecovery: true` qui remplit
      `ast.errors` de la même manière. Utile pendant la phase 1 : sans ça, une régression
      de portage qui casserait le parse d'une famille de fichiers passerait pour un simple
      « 0 match ». *(1 h)*

      **Fréquence réelle : faible, et à ne pas surestimer.** Le seul cas rencontré sur le corpus
      était un fallback HTML servi à la place d'un chunk — or jxscout ne l'aurait jamais soumis
      à l'analyzer, puisqu'il classe par sniffing de contenu et non par extension d'URL. Du JS
      réellement servi par un site est du JS qu'un navigateur exécute, donc syntaxiquement
      valide. Le défaut reste réel — `parsed.errors` n'est consulté nulle part — mais aucun cas
      de production ne l'a encore déclenché.

      Matrice de comportement des modes, mesurée sur oxc 0.68.1 :

      | Syntaxe | `ts` | `tsx` | `jsx` |
      |---|---|---|---|
      | `const f = <T>(x: T) => x` (générique fléché) | ok | **erreur** | **erreur** |
      | `const y = <string>z` (assertion à chevrons) | ok | **erreur** | **erreur** |
      | `const e = <div>hi</div>` (JSX) | **erreur** | ok | ok |
      | `interface` / `enum` / `as` | ok | ok | **erreur** |
      | `function f<T>(x: T): T` (générique nommé) | ok | ok | **erreur** |

      Lecture : `tsx` et `ts` ne divergent que sur **deux** syntaxes, et le TypeScript ordinaire
      passe identiquement dans les deux. `tsx` reste donc le bon défaut. Le mode `jsx` casse sur
      tout ce qui est typé et n'a aucun intérêt ici.

- [x] **Choisir les plugins babel selon l'extension du fichier** — proposition kbtch_, retenue.
      C'est ce que l'auteur d'origine voulait manifestement faire, et babel s'y prête mieux
      qu'oxc puisqu'il expose des plugins composables plutôt qu'un `lang` monolithique :

      | Extension | `plugins` |
      |---|---|
      | `.ts` | `["typescript"]` |
      | `.tsx` | `["typescript", "jsx"]` |
      | `.jsx` | `["jsx"]` |
      | `.js` `.mjs` `.cjs` | `["jsx"]` |
      | inconnue / absente | `["typescript", "jsx"]` (le plus permissif) |

      Deux réserves. `typescript` et `flow` sont **mutuellement exclusifs** chez babel : un
      fichier Flow (reconnaissable au pragma `/* @flow */`) demande une bascule explicite, il ne
      suffit pas d'empiler les plugins. Et le `sourceType: "unambiguous"` visé change aussi le
      comportement — l'analyzer force aujourd'hui `"module"`, ce qui fait échouer certains
      fichiers script.

      **Méthode — décision kbtch_ : faire bien tout de suite**, détection d'extension et
      `sourceType: "unambiguous"` inclus dans le port, plutôt qu'un port à iso-comportement suivi
      d'améliorations. Acté.

      La conséquence à assumer est que le comparateur cesse d'être un test binaire (« zéro écart
      ou régression ») pour devenir un **inventaire à expliquer** : il y aura des écarts, et
      chacun devra être justifié à la main. C'est son usage normal, simplement plus coûteux à
      dépouiller.

      Le coût d'attribution se récupère presque gratuitement en rendant le choix du mode
      **paramétrable** dans l'implémentation, par variable d'environnement. Le même binaire
      permet alors deux captures — une avec la détection d'extension active, une avec
      `["typescript","jsx"]` forcé partout — et la comparaison des deux isole exactement ce que
      la détection a changé, sans avoir eu à étaler le travail dans le temps.
- [x] **Adapter le walker.** Babel fournit `loc` nativement, donc tout le calcul de
      `lineOffsets` + `getPosition` de `walker.ts` devient inutile — c'est autant de moins
      à optimiser en phase 2. Vérifier que `node.start` / `node.end` restent disponibles
      (ils le sont, mais `value: source.slice(start, end)` en dépend partout). *(1 h)*
- [ ] **Porter les 5 fichiers qui touchent `Literal`.** Attention à deux détails :
      `(node as any).regex` d'ESTree devient un nœud `RegExpLiteral` chez Babel, et les tests
      `arguments[0].type === "Literal"` deviennent `"StringLiteral"`. *(1 h 30)*
- [ ] **Faire passer le comparateur de la phase 0 au vert** sur tout le corpus. Toute
      divergence est soit un bug de port, soit un écart de sémantique de parser à documenter.
      *(1-2 h, c'est là que ça se joue)*
- [ ] **Mesurer le nouveau run complet** et le RSS, sur le petit et le gros bundle.
      Comparer aux 13,43 s / 692 Mo. *(20 min)*
- [ ] **Supprimer la machinerie native devenue morte** : les 9 `//go:embed parser.*.node`
      (`internal/modules/ast-analyzer/module.go:31-55`), `getNativeLibraryPath()`, la ligne
      `cmd.Env = append(...)` (l.376), le patch `scripts/patch-ast-analyzer-build/patch.ts`
      et sa ligne dans le `Makefile`. Vérifier que `make build` passe toujours. *(45 min)*
- [ ] **Décider du sort de rsbuild.** Bun exécute le TS directement et le démarrage runtime
      est à 27 ms : `exec.Command("bun","run","pkg/ast-analyzer/index.ts", path)` suffirait, ce
      qui supprimerait l'étape de build. À arbitrer contre le coût de résolution de
      `node_modules` à chaque spawn, qui lui n'est pas mesuré. *(30 min de mesure + décision)*

---

## Phase 2 — Le plancher du walk

*4,5 s de parcours pur sur 10,9 Mo, indépendamment des analyzers. Tout le reste en dépend.*

- [ ] **Profiler le walk pour de vrai** avant d'optimiser à l'aveugle. Trois suspects, par
      ordre d'exposition : l'attachement d'un objet `loc` à chaque nœud entré, la pile
      d'ancêtres poussée/dépilée à chaque nœud, le fan-out des callbacks (18 appels par
      `CallExpression`). Si la phase 1 a fait disparaître le premier, re-mesurer avant de
      conclure. *(1 h)*
- [ ] **Rendre `loc` paresseux si le profil le confirme** — il n'est utile que sur les nœuds
      effectivement retenus par un analyzer, c'est-à-dire une poignée. *(1 h)*
- [ ] **Ne construire la pile d'ancêtres que si un analyzer la demande.** Regarder d'abord
      lesquels utilisent réellement le paramètre `ancestors` : s'ils sont peu nombreux, la
      pile peut devenir optionnelle. *(1 h)*
- [ ] **Re-mesurer et consigner.** Si le walk ne descend pas significativement, arrêter les
      frais et passer à la suite : 4,5 s sur un bundle de 11 Mo n'est pas rédhibitoire.
      *(20 min)*

---

## Phase 3 — Dompter `secrets`

*6,6 s pour 3 matches. Le plus mauvais ratio du projet.*

- [ ] **Mesurer d'abord la valeur réelle.** Combien de matches `secrets` sur tout le corpus,
      et combien sont autre chose qu'une DSN Sentry ou une clé publique par design ?
      Si le taux de vrai positif est nul, la question n'est pas d'optimiser mais de retirer.
      *(45 min)*
- [ ] **Si on garde : pré-filtrer avant la boucle de 1600 regex.** Un littéral qui ne contient
      ni chiffre ni caractère non-alphabétique, ou qui fait moins de N caractères, ne peut
      matcher aucun pattern de clé d'API. Le test grossier coûte des ordres de grandeur de
      moins que 1600 `.test()`. *(1 h 30)*
- [ ] **Sinon : sortir `secrets` du passage par défaut** et n'en faire qu'une passe dédiée,
      lancée explicitement. Le filtre `analyzersToRun` le permet déjà sans écrire une ligne.
      *(30 min)*

---

## Phase 4 — Fusion détection + taint

*Le cœur du chantier. C'est ici que le travail fait sur l'agent JS entre dans jxscout.*

Le principe : aujourd'hui la détection est un `rg` qui rend une ligne de texte, et le taint est
un outil séparé qui prend `(fichier, nom d'identifiant, ligne)` — ce couple étant produit par un
LLM, avec la variance que ça implique. En AST, le nœud du sink **contient** ses opérandes : plus
besoin de nommer quoi que ce soit, ni de transcrire.

- [ ] **Écrire la table sink → opérande à tainter.** Un tableau, pas du code : pour chaque
      analyzer existant, quel(s) sous-nœud(s) portent la valeur qui nous intéresse.
      `innerHTML =` → `node.right` ; `eval(x)`, `document.write(x)`, `window.open(x)` →
      `arguments[0]` ; `insertAdjacentHTML`, `setAttribute` → `arguments[1]` ;
      `dangerouslySetInnerHTML` → la `.value` de la propriété `__html` ; template CSPT →
      `TemplateLiteral.expressions[]`, qui donne la liste **exacte et complète** des racines ;
      proto-pollution `o[k]=v` → `node.left.property`, la clé. Seul `DOM_CLOBBERING` n'a pas
      d'opérande : c'est structurel, il restera à part. *(1 h 30 — c'est de la réflexion, pas
      de la frappe)*
- [ ] **Porter le résolveur de taint sur des nœuds au lieu de noms.** La logique de
      `bindObject` / `resolveParam` reste identique ; ce qui disparaît, c'est `findItem`, la
      recherche d'un identifiant par nom et ligne, et son ambiguïté quand deux `t` sont sur la
      même ligne. L'entrée devient un nœud, pas un triplet. *(2-3 h, à découper)*
- [ ] **Brancher le scope babel.** C'est le point qui justifie le port : le taint a besoin de
      `getBinding`, et on est maintenant dans le même arbre que la détection. Attention,
      `@babel/traverse` construit un `NodePath` **par nœud**, ce qui est exactement le genre de
      coût qu'on vient de traquer en phase 2 : ne le payer que sur les nœuds retenus, pas sur
      l'arbre entier. *(2 h)*
- [ ] **Résoudre les noms de propriété calculés — reporté, à faire ici.** Tous les analyzers
      testent des noms littéraux (`el.fetch`, `el["fetch"]`). Trois familles leur échappent, et
      elles partagent le mécanisme du point précédent (`path.scope.getBinding`) :
      `var a = "fetch"; el[a](u)` — le nom vit dans une variable. Le `!computed` ajouté aux
      analyzers n'aide pas contre ça : il retire un faux positif, il ne révèle rien.
      Mesuré sur `~/jxscout` : `X[<identifiant>](…)` **6882** — c'est le seul volume réel, et
      c'est du minifieur ordinaire référençant une variable, pas de l'évasion délibérée.
      Les familles « dissimulation » sont **absentes du corpus**, vérifié : découpage de nom
      `["fe" + "tch"]` **0** · `[atob(…)]` **0** · noms `_0x…` (signature
      `javascript-obfuscator`) 52 occurrences seulement. (Une première mesure annonçait 1253
      concaténations : motif trop large, il comptait `["item-" + id]`, `["cScale" + i]` et
      autres constructions de clé dynamique légitimes — chiffre invalide, retiré.)
      Même dépendance que les alias de `document` (`d.cookie` où `d = document`, réservoir
      mesuré à 1431 `var X = document` + 310 affectations). Un seul mécanisme débloque les deux
      familles. Décision kbtch_ (2026-08-02) : hors périmètre du port, ni jxscout amont ni
      l'analyzer regex ne le couvrent — *stick to the plan*. *(non chiffré)*
- [ ] **Rejouer la vérité terrain Easyship.** Les 3 CSPT `t`@54304/54321/54579 doivent ressortir
      `SOURCE_CONFIRMED` avec la trace `URLSearchParams(window.location.search)`, sans qu'aucun
      LLM n'intervienne. C'est le test qui valide toute la phase. *(1 h)*
- [ ] **Rejouer les loupés Radio France.** Les trois sinks `<img src>` que la regex ratait :
      le Sink A (clé d'objet `src:`) doit tomber sur un visitor de propriété, les Sinks B et C
      (template détaché, préfixe hissé en constante) sur un visitor de template. Vérifier au
      passage le volume de bruit que ça génère : c'est l'ancre `/`-littérale de la regex qui
      bornait le firehose, et elle ne se transpose pas telle quelle. *(1 h 30)*
- [ ] **Resserrer deux faiblesses connues du taint** avant de croire les verdicts HIGH sur gros
      bundles : `SOURCE_GLOBALS` traite tout `document.<prop>` comme une source confirmée
      (`document.createElement`, `document.contentDocument` n'en sont pas), et le RANK
      best-of promeut un finding entier au HIGH dès qu'**une** branche du fan-out
      `resolveParam` est confirmée — 1 sur 9 a suffi à produire le faux positif `t`@26490.
      *(1 h 30)*

---

## Phase 5 — Persistance normalisée

*Le JSON de l'analyzer est aujourd'hui stocké en bloc. Ça ne se requête pas.*

État actuel : `internal/modules/ast-analyzer/repository.go:68` crée
`ast_analysis_results (asset_id, asset_type, asset_path, analyzer_version, results)` et
`INSERT` le JSON brut dans `results`. C'est parfait comme journal, inutilisable comme index.

- [ ] **Définir le schéma de la table de leads** : une ligne par sink retenu, pas un blob par
      asset. Reprendre ce qui est déjà éprouvé dans `findings.db` — classe, fichier, position,
      identifiant, verdict de taint, trace, score agent, note, raison de rejet, verdict humain.
      *(1 h)*
- [ ] **Écrire la migration** et brancher l'insertion normalisée, en gardant le blob JSON à
      côté comme journal d'origine. *(1 h 30)*
- [ ] **Rejouer un corpus complet et vérifier les compteurs** contre les chiffres connus
      (1027 findings bruts, 696 après nettoyage des patterns, 79 `IN_DEPTH`). Un écart massif
      signale un bug de port, pas un progrès. *(1 h)*

---

## Phase 6 — Déclenchement automatique et concurrence

*L'objectif d'origine : chaque nouveauté crawlée est analysée sans intervention.*

- [ ] **Localiser le point où le fetcher acte un asset neuf ou modifié** et vérifier ce qui
      déclenche l'analyse aujourd'hui. Le contrat est déjà « 1 fichier → JSON sur stdout »
      (`module.go:365`, `exec.Command("bun","run",binaire,absPath)`), donc il s'agit de
      déplacer un appel, pas de refondre. *(1 h de lecture)*
- [ ] **Décider de la politique de re-analyse.** jxscout ne purge jamais les anciennes versions
      et Vite met un hash de contenu dans le nom : chaque déploiement crée un fichier « neuf »
      pour le crawler. Sans politique, l'analyse automatique re-analyse cinq builds du même
      bundle. Dépend de la phase 7. *(45 min)*
- [ ] **Borner la mémoire.** 692 Mo de RSS par parse mesurés côté babel, avec une concurrence
      par défaut de 5. Soit fixer un plafond de taille de fichier au-delà duquel on sérialise,
      soit baisser la concurrence quand les fichiers sont gros. À décider sur mesure réelle,
      pas sur principe. *(1 h)*
- [ ] **Vérifier le comportement en cas d'échec d'un analyzer.** Aujourd'hui, `execASTAnalyzer`
      traite **toute** sortie sur stderr comme une erreur fatale (`module.go`, juste après la
      lecture des pipes) — un simple warning du parser suffirait donc à faire échouer l'analyse
      d'un asset. À confirmer et à durcir si c'est bien le cas. *(45 min)*

---

## Phase 7 — Déduplication structurelle

*La condition pour que l'analyse automatique ne soit pas une machine à re-juger la même chose.*

- [ ] **Définir la clé de hash sur le sous-arbre normalisé du sink** : structure et littéraux,
      identifiants minifiés exclus. Insensible au décalage de ligne **et** au renommage entre
      deux builds — les deux causes des doublons actuels. Le cas mesuré : 6 paires
      inter-builds à Δ 11-19 lignes, `duplicate_id` NULL, juge payé deux fois. *(1 h 30)*
- [ ] **Vérifier la stabilité de la clé sur les paires connues** avant de l'adopter : les deux
      builds Easyship qui portent les mêmes CSPT doivent produire des hash identiques.
      *(45 min)*
- [ ] **Brancher le ledger** : premier vu, nombre de passages, votes cumulés, verdict humain
      figé. Un lead rejeté par kbtch_ ne doit jamais remonter. C'est ce qui rend le repassage
      rentable au lieu de répétitif. *(2 h)*
- [ ] **Décider du sort de l'A/B gratuit.** Les doublons inter-builds non détectés fournissent
      aujourd'hui une mesure gratuite de la variance du juge sur entrée identique
      (deux verdicts divergents observés sur le même sink). Réparer la dédup supprime cette
      mesure — la récolter avant, ou la conserver derrière un drapeau. *(30 min)*

---

## Questions ouvertes

- **Le module `sourcemaps`.** Il existe un `pkg/sourcemap-reverse` et un
  `internal/modules/sourcemaps/` avec son `mappings.wasm`. La note de projet affirme que
  jxscout ne restaure pas les sourcemaps, ce qui a motivé l'écriture d'un
  `restore-sourcemaps.ts` séparé. À confronter avant de maintenir deux outils en parallèle —
  un reverse-lookup de position n'est pas une écriture de sources sur disque, les deux ne sont
  pas forcément contradictoires.
- **~~`websocket.go`~~ — résolu (kbtch_, 2026-08-01).** C'est bien l'extension VSCode qui
  consomme les résultats, via websocket : `jxscout-vscode-f/src/services/websocket-client.ts`
  porte un type miroir avec un champ `analyzerName`. Côté serveur,
  `internal/modules/ast-analyzer/websocket.go` expose un `getAnalysisHandler` qui reçoit un
  `getAnalysisRequest{filePath}` et répond un `getAnalysisResponse{results []ASTAnalyzerTreeNode}`.
  C'est donc du **pull** — l'éditeur demande l'analyse d'un fichier — et non du push.

  **Arbitrage kbtch_ : la réécriture de l'extension est inévitable mais vient en dernier.** Il ne
  s'en sert pas aujourd'hui, donc casser le contrat en cours de route ne bloque rien : on répare
  à la fin. À ne pas confondre avec « sans intérêt » — le panneau latéral qui liste les résultats
  à côté du code est jugé « vraiment pas mal » pour retrouver les identifiants rapidement, ce qui
  en fait justement une bonne surface pour afficher les traces de taint une fois la phase 4 faite.
  Conséquence pratique : les phases 1 à 7 peuvent changer le format de sortie librement ; la
  remise en cohérence des deux forks est une tâche de fin de chantier, pas une contrainte
  permanente.
- **`format.go` / `format_test.go`.** Non lus. Ils touchent probablement à la mise en forme des
  résultats — donc au contrat de sortie.
- **Le repo amont est archivé** depuis le 12 avril 2026, avec renvoi vers une version « Pro ».
  Pas d'amont à suivre, pas de PR à espérer, licence figée à cette date, maintien intégralement
  à charge.
