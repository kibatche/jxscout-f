# Filet de non-régression de l'analyzer AST

> Écrit par Shevek (IA) sur mandat de kbtch_, 2026-08-01.
> Ces deux outils existent pour une seule raison : permettre de remplacer le parser oxc par
> babel sans avoir à croire sur parole que les résultats n'ont pas changé.

## Le problème que ça résout

L'analyzer AST de jxscout est un CLI one-shot : il reçoit un chemin de fichier en argument et
écrit un tableau JSON de matches sur sa sortie standard. Le porter d'un parser à un autre veut
dire toucher au type des nœuds, au nom des types de nœuds, et à la façon dont les positions sont
calculées. Sur un corpus de bundles minifiés de plusieurs mégaoctets, il est impossible de
vérifier à l'œil qu'on n'a rien cassé.

D'où la méthode : on fige un corpus, on enregistre ce que l'analyzer actuel en dit, et après
chaque modification on compare. Un match qui disparaît est une régression. Un match qui apparaît
ou qui se déplace demande à être expliqué, mais ne casse rien en soi.

## Les trois emplacements

Le corpus et les captures vivent **hors du dépôt**, sous `~/jxscout-regression/` par défaut :

```
~/jxscout-regression/
├── corpus/      24 bundles figés, copiés depuis ~/jxscout et jamais modifiés
├── baseline/    la capture de référence : un JSON par bundle + manifest.json
└── MANIFEST.md  la liste du corpus, avec tailles et empreintes
```

Ils sont hors du dépôt pour deux raisons : ce sont 30 Mo de code tiers qui n'ont rien à faire
dans un historique git, et le corpus doit survivre à un `git clean`. Le répertoire racine se
change avec la variable d'environnement `JXSCOUT_REGRESSION_DIR`.

Les deux outils, eux, sont versionnés dans `scripts/regression/`.

## Constituer ou reconstituer le corpus

Le corpus a été bâti une fois, de façon déterministe, et il n'y a pas de script pour le
refaire — le refaire à l'identique n'a pas de sens, puisque `~/jxscout` évolue à chaque crawl.
Ce qui compte est la règle de sélection, pour pouvoir en constituer un comparable ailleurs :

1. **Cinq fichiers imposés**, ceux dont la vérité terrain est connue et documentée. Les deux
   bundles Easyship qui portent les trois CSPT `t`@54304/54321/54579, et les trois chunks
   Radio France en Svelte compilé dont on sait que la détection par regex les ratait.
2. **Une stratification par taille**, programme par programme : pour chacun des cinq programmes
   réels, les fichiers `original/*.js` de plus de 500 octets sont triés par taille, et on prend
   ceux qui tombent aux percentiles 10, 50, 90 et 100. Le percentile 100 donne le cas extrême
   (jusqu'à 13 Mo), le percentile 10 donne les petits chunks où un bug de position se voit tout
   de suite.
3. **Le programme `default` est exclu** : ses fichiers sont des doublons de `sncf-connect`.

Le résultat couvre quatre chaînes de build différentes — Vite (Easyship), Next.js
(SNCF Connect), Svelte (Radio France), webpack (Infomaniak, Inria) — ce qui est le vrai
critère : un portage de parser casse rarement partout, il casse sur une forme syntaxique.

Les noms sont aplatis à la copie (`programme__host__chemin__fichier.js`) pour que le corpus soit
un répertoire plat, et que le nom reste traçable jusqu'à la source.

## Capturer une référence

```bash
cd ~/Projects/jxscout-f
bun run scripts/regression/capture.ts
```

Sans argument, la capture écrit dans `~/jxscout-regression/baseline/` en exécutant le bundle de
production `internal/modules/ast-analyzer/ast-analyzer.js`. C'est la référence : celle qui
correspond à ce que jxscout fait réellement tourner aujourd'hui.

Pour capturer une **autre** implémentation, on passe le répertoire de sortie en argument et on
désigne l'analyzer par variable d'environnement :

```bash
# le TS source plutôt que le bundle
JXSCOUT_ANALYZER="$PWD/pkg/ast-analyzer/index.ts" JXSCOUT_NATIVE_PARSER=/nonexistent \
  bun run scripts/regression/capture.ts ~/jxscout-regression/candidate-tssource
```

Trois variables sont reconnues :

| Variable | Rôle | Défaut |
|---|---|---|
| `JXSCOUT_REGRESSION_DIR` | racine du corpus et des captures | `~/jxscout-regression` |
| `JXSCOUT_ANALYZER` | l'implémentation à exécuter | le bundle `ast-analyzer.js` |
| `JXSCOUT_NATIVE_PARSER` | le binding natif oxc à charger | `parser.linux-x64-gnu.node` du dépôt |

`JXSCOUT_NATIVE_PARSER` mérite un mot. Le bundle produit par rsbuild ne sait pas trouver son
binding natif tout seul : le script `scripts/patch-ast-analyzer-build/patch.ts` le réécrit pour
qu'il charge la bibliothèque désignée par `NAPI_RS_NATIVE_LIBRARY_PATH`, et c'est le Go qui
positionne cette variable au moment du spawn. En lançant l'analyzer à la main sans elle, on
obtient `Failed to load native binding`. Le TS source, lui, n'en a pas besoin : il résout
`oxc-parser` depuis `node_modules` — d'où le `/nonexistent` de l'exemple, qui neutralise
l'injection de la variable.

La capture écrit un `<nom>.js.json` par bundle, plus un `manifest.json` qui retient pour chaque
fichier sa taille, son empreinte SHA-256, la durée du run et le nombre de matches. L'empreinte
sert à détecter qu'un fichier du corpus a bougé, ce qui invaliderait la comparaison.

Deux normalisations sont appliquées avant écriture, et il faut savoir lesquelles :

- **Le champ `filePath` est réécrit** avec le nom du fichier dans le corpus. Il contient sinon un
  chemin absolu, qui diffère d'une machine à l'autre et ferait diverger tous les matches.
- **Les matches sont triés** sur `analyzerName`, puis position, puis valeur. Rien ne garantit que
  deux implémentations du parcours d'arbre émettent les matches dans le même ordre, et cet
  ordre-là n'est pas ce qu'on cherche à vérifier.

## Comparer deux captures

```bash
bun run scripts/regression/compare.ts ~/jxscout-regression/baseline ~/jxscout-regression/candidate
```

La comparaison se fait en deux passes, fichier par fichier.

La première apparie tout ce qui est identique **au contenu et à la position**. La seconde reprend
ce qui reste et tente de l'apparier **sur le contenu seul** : ce qui s'apparie est un
*déplacement*, c'est-à-dire un match toujours présent que le nouveau parser situe ailleurs ; ce
qui ne s'apparie pas est une vraie *apparition* ou une vraie *disparition*.

Cette distinction est le cœur de l'outil. Un changement de parser peut légitimement décaler des
positions — c'est ennuyeux, ça demande vérification, mais ça ne perd rien. Un match disparu, lui,
veut dire que le portage ne voit plus quelque chose que l'original voyait.

Les appariements tiennent compte des doublons : un même sink peut apparaître plusieurs fois dans
un bundle, et apparier sans multiplicité masquerait des différences réelles.

Le code de sortie est **1** s'il y a au moins un match disparu ou un fichier absent de la capture
candidate, **0** sinon. Il est donc utilisable tel quel dans un `make` ou un hook.

## Ce que le filet a déjà trouvé

Sa première exécution réelle, comparant le bundle de production au TS source du même dépôt, a
sorti **19 matches disparus, 0 apparu, 0 déplacé**, tous produits par l'analyzer `graphql`, tous
sur des `TemplateLiteral`, répartis sur cinq bundles.

Autrement dit : **le bundle rsbuild et le TS source ne donnent pas le même résultat**, alors
qu'ils sont censés être le même programme. Les positions, elles, sont parfaitement stables — ce
n'est donc pas un décalage de calcul de lignes, mais bien un analyzer qui se comporte
différemment. L'explication la plus probable est que le bundle embarque une version d'`oxc-parser`
différente de celle qui est aujourd'hui dans `node_modules` (0.68.1), et que la forme de l'AST des
littéraux de gabarit a changé entre les deux.

Sur le fond, les 19 matches en question sont des faux positifs — des sélecteurs CSS et des clés
d'internationalisation reconnus comme du GraphQL — donc le TS source est *plus* juste que le
bundle. Mais ce n'est pas le sujet : le sujet est qu'on ne peut pas prendre le TS source comme
référence en croyant qu'il est équivalent au bundle. **La référence doit rester le bundle**,
puisque c'est lui que jxscout exécute.

## Coût d'un passage

37 secondes pour les 24 fichiers, 14 960 matches au total. Deux fichiers pèsent à eux seuls
27 des 37 secondes : le bundle kmeet d'Infomaniak (13 Mo, 14,2 s) et le bundle applicatif
d'Easyship (10,9 Mo, 13,3 s). Tout le reste passe sous les 2,5 secondes.
