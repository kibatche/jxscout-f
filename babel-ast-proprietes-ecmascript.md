---
id: kb_3d9a4c17be02
type: idea
title: "Propriétés ECMAScript et arbre Babel — comment y accéder, et pourquoi comme ça"
tags: [babel, ast, javascript, static-analysis, jxscout]
status: budding
quality: 8
quality_inferred: false
confidence: 0.95
source_kind: internal
created: 2026-08-02
updated: 2026-08-02
related:
  - slug: jxscout
    type: related
  - slug: jsanalyzer
    type: related
convention: kb-v3
---

# Propriétés ECMAScript et arbre Babel

Toutes les sorties de ce document ont été produites sur `~/Projects/jxscout-f/node_modules` le 2026-08-02. La commande pour les rejouer est en § 12.

---

## 1. Deux mondes qu'il ne faut jamais confondre

Il y a le **monde de l'exécution** : `window.onhashchange = f` va chercher l'objet `window`, y pose une clé nommée `onhashchange`, et le navigateur déclenchera `f` au changement de fragment d'URL.

Il y a le **monde du texte** : ce même bout de source, une fois analysé (*parsé*), est un arbre de nœuds. Rien n'est exécuté, rien n'est évalué, aucune valeur n'existe. `window` n'est pas l'objet global — c'est un nœud qui porte le nom `"window"`, et ce nom pourrait aussi bien désigner une variable locale déclarée trois lignes plus haut.

Babel vit entièrement dans le second monde. Chaque fois qu'un test d'analyseur te paraît tordu, c'est presque toujours qu'une intuition du premier monde s'est glissée dedans. Exemple typique : « `document.cookie`, c'est une propriété de `document` ». Vrai à l'exécution. Dans l'arbre, `document` et `cookie` sont deux nœuds frères sous un même parent, et **aucun des deux n'est propriétaire de l'autre**.

---

## 2. Une propriété, côté langage

Un objet ECMAScript est une table de clés → valeurs. Les clés sont des chaînes (ou des `Symbol`). Deux syntaxes pour y accéder :

```js
document.cookie        // accès par point      — la clé est écrite en clair
document["cookie"]     // accès par crochets   — la clé est une expression
```

Les deux lisent exactement la même clé. La différence est **où le nom de la clé est décidé** :

- Par point, le nom est figé dans le source. `document.cookie` lira toujours `cookie`.
- Par crochets, le nom est le **résultat** d'une expression, calculé à l'exécution :

```js
document["cookie"]     // constante  → toujours "cookie"
document[c]            // variable   → dépend de ce que vaut c
document["coo"+"kie"]  // calcul     → "cookie", mais illisible statiquement sans évaluer
```

C'est cette distinction que Babel appelle `computed`. Elle est la source de la moitié des tests d'analyseur qui ont l'air redondants.

Un mot sur le global. En page web, `window` est l'objet global, et toute variable globale est une propriété de `window`. Donc ces trois lignes font la même chose à l'exécution :

```js
window.onhashchange = f
self.onhashchange = f
onhashchange = f          // portée globale : affectation à une variable globale
```

À l'exécution, oui. Dans l'arbre, non : les deux premières sont des affectations à une propriété, la troisième est une affectation à un **identifiant nu**, un type de nœud complètement différent. Un analyseur qui ne teste que les propriétés rate la troisième forme. (C'est exactement le trou constaté dans `onhashchange.ts`.)

---

## 3. `MemberExpression` : trois champs, pas un de plus

Le nœud qui représente un accès à une propriété s'appelle `MemberExpression`. Il porte trois choses utiles :

| Champ | Contenu | Rôle |
|---|---|---|
| `object` | un nœud | ce à gauche du point ou du crochet |
| `property` | un nœud | ce à droite |
| `computed` | booléen | `false` = point, `true` = crochets |

Schéma minimal :

```
document.cookie

MemberExpression
├── object   : Identifier "document"
├── property : Identifier "cookie"
└── computed : false
```

Maintenant les quatre variantes qui comptent, côte à côte :

```
document.cookie          document["cookie"]        document[c]              document[cookie]
                                                   (c est une variable)     (idem, sans guillemets)

MemberExpression         MemberExpression          MemberExpression         MemberExpression
├─ object   Identifier   ├─ object   Identifier    ├─ object   Identifier   ├─ object   Identifier
│           "document"   │           "document"    │           "document"   │           "document"
├─ property Identifier   ├─ property StringLiteral ├─ property Identifier   ├─ property Identifier
│           "cookie"     │           "cookie"      │           "c"          │           "cookie"
└─ computed false        └─ computed true          └─ computed true         └─ computed true
```

Regarde bien la première et la dernière colonne. **Même type de nœud `property`, même nom `"cookie"`, et pourtant deux choses opposées** : à gauche la clé `cookie`, à droite la valeur de la variable `cookie`, dont on ne sait rien. Voilà pourquoi le test n'est jamais « la propriété s'appelle `cookie` » tout court, mais :

```js
(t.isIdentifier(node.property, { name: "cookie" }) && !node.computed)  // document.cookie
|| t.isStringLiteral(node.property, { value: "cookie" })               // document["cookie"]
```

Deux branches, parce qu'il y a deux écritures légitimes, et le `!computed` sur la première parce que sans lui on avale `document[cookie]`.

Le `!computed` sur la branche `StringLiteral` serait inutile : un `StringLiteral` en position de propriété **ne peut apparaître que** entre crochets, `computed` y est donc toujours `true`. C'est pourquoi tu le vois parfois omis — ce n'est pas un oubli.

---

## 4. La profondeur : l'arbre penche à gauche

Un `MemberExpression` ne décrit **qu'un seul point**. Deux points, deux nœuds imbriqués — et l'imbrication va vers la gauche :

```
window.document.cookie

MemberExpression                     ← le nœud "extérieur", celui que tu vois en premier
├── object : MemberExpression        ← window.document, un nœud entier
│           ├── object   : Identifier "window"
│           ├── property : Identifier "document"
│           └── computed : false
├── property : Identifier "cookie"
└── computed : false
```

À retenir : **la dernière propriété écrite est celle du nœud extérieur.** `window.document.cookie` est, vu de l'arbre, « le `.cookie` de (`window.document`) ». Le chemin d'accès n'est pas une liste plate ; c'est un empilement, et on l'attaque par la fin.

Vérification sur `window.top.onhashchange = f` (sortie réelle, § 12) :

```
AssignmentExpression
├─ left  MemberExpression
│        ├─ object   MemberExpression
│        │            ├─ object   Identifier "window"
│        │            └─ property Identifier "top"
│        └─ property Identifier "onhashchange"     ← le nom cherché est ICI
└─ right Identifier "f"
```

Le nom `onhashchange` est sur `left.property`. Peu importe qu'il y ait un, deux ou six points à gauche : `left.property` ne bouge pas. C'est le cœur du sujet, et j'y reviens en § 10.

---

## 5. Lire ou écrire : `AssignmentExpression`

Une affectation est son propre nœud, et il enveloppe le `MemberExpression` :

```
document.cookie = "a=b"

AssignmentExpression
├── operator : "="
├── left  : MemberExpression   (document.cookie)
└── right : StringLiteral      ("a=b")
```

Conséquence directe : le même `document.cookie` apparaît dans l'arbre pour une **lecture** (`var x = document.cookie`) et pour une **écriture** (`document.cookie = …`). Le nœud `MemberExpression` est identique dans les deux cas ; ce qui les distingue, c'est **le parent**.

```
lecture                                écriture
VariableDeclarator                     AssignmentExpression
├─ id   Identifier "x"                 ├─ left  MemberExpression  ← même nœud
└─ init MemberExpression  ← même nœud  └─ right StringLiteral
```

D'où la structure de `cookie.ts` : un visiteur sur `AssignmentExpression` pour les écritures (`cookie-assignment`), un visiteur sur `MemberExpression` pour les lectures (`cookie-read`), et dans le second une garde qui écarte les nœuds déjà comptés comme écriture :

```js
if (path.findParent(p => p.isAssignmentExpression() && p.node.left === path.node)) return;
```

Sans cette garde, `document.cookie = "x"` produirait deux matchs : un depuis le visiteur d'affectation, un depuis le visiteur de membre. La distinction lecture/écriture n'est pas cosmétique en sécurité — un `document.cookie` en lecture est une **source** potentielle (vol de session), en écriture une **puits** potentielle (fixation, injection d'attributs).

---

## 6. Appeler : `CallExpression`

```
window.addEventListener("hashchange", f)

CallExpression
├── callee : MemberExpression
│            ├── object   : Identifier "window"
│            ├── property : Identifier "addEventListener"   ← le nom de la méthode est ICI
│            └── computed : false
└── arguments : [
      StringLiteral "hashchange",     ← arguments[0] : le nom de l'événement est ICI
      Identifier "f"                  ← arguments[1] : le handler
    ]
```

C'est le point qui a fait dérailler l'analyseur `onhashchange`. La cible porte **deux noms**, et ils vivent dans deux branches différentes de l'arbre :

- `addEventListener` → `callee.property`
- `"hashchange"` → `arguments[0]`

Ni l'un ni l'autre ne se trouve dans `callee.object` — `callee.object`, c'est `window`, la cible de l'appel. Chercher `"hashchange"` quelque part dans le callee ne peut structurellement rien trouver : le nom de l'événement n'est pas dans le callee, il est dans les arguments.

Et le compte d'arguments : `addEventListener(type, listener)` est la forme à deux arguments, la plus courante. Le troisième (`useCapture` ou l'objet d'options) est facultatif. Un test `arguments.length > 2` exclut donc la majorité des cas réels ; c'est `>= 2` qu'il faut.

---

## 7. Chaînage optionnel : les nœuds jumeaux

`a?.b` n'est pas un `MemberExpression`. Babel crée un type distinct, `OptionalMemberExpression`, et pareil pour les appels :

```
w?.f(1)

OptionalCallExpression
├── callee : OptionalMemberExpression
│            ├── object   : Identifier "w"
│            ├── property : Identifier "f"
│            └── optional : true
├── arguments : [ NumericLiteral 1 ]
└── optional  : false
```

Trois faits vérifiés, et chacun coûte un bug si on l'ignore :

1. **`t.isMemberExpression(a?.b)` renvoie `false`.** Les helpers sont stricts sur le type. Un test écrit uniquement pour `MemberExpression` ignore silencieusement toute la syntaxe optionnelle.
2. **La contagion remonte la chaîne.** Dans `a?.b.c`, le `.c` n'est pourtant pas optionnel — et le nœud extérieur est quand même un `OptionalMemberExpression` (avec `optional: false`, le champ marquant quel maillon porte le `?.`). Donc `w?.document.cookie` est intégralement en nœuds « optionnels ». Un visiteur enregistré seulement sur `MemberExpression` n'est jamais appelé dessus.
3. **Une parenthèse casse la contagion** : `(a?.b).c` redevient un `MemberExpression` ordinaire.

D'où la double inscription systématique en fin d'analyseur :

```js
return {
  MemberExpression:         handleMemberExpression,
  OptionalMemberExpression: handleMemberExpression,   // même fonction, autre type de nœud
}
```

**Correction d'un point que j'ai affirmé deux fois de travers dans nos échanges précédents.** J'ai dit que `a?.b = c` était une erreur de syntaxe. Babel répond en réalité :

```
This experimental syntax requires enabling the parser plugin: "optionalChainingAssign". (1:0)
```

Ce n'est donc pas invalide en soi, c'est une proposition non standardisée, refusée par défaut. Le résultat pratique est le même — sans le plugin, aucun code parsé ne produira jamais un `OptionalMemberExpression` en position `left` — mais la raison est différente, et la formulation exacte compte si la config du parseur change un jour.

---

## 8. Le visiteur et `NodePath`

`traverse` parcourt l'arbre et appelle ta fonction à chaque nœud dont le **type** correspond à une clé de l'objet visiteur :

```js
traverse(ast, {
  MemberExpression(path) { /* appelé pour chaque MemberExpression rencontré */ },
  CallExpression(path)   { /* … */ },
})
```

Ce que tu reçois n'est pas le nœud mais un `NodePath` : le nœud **plus son contexte**.

| Accès | Ce que c'est |
|---|---|
| `path.node` | le nœud lui-même (`type`, `object`, `property`, …) |
| `path.parent` | le nœud parent |
| `path.parentPath` | le `NodePath` du parent (permet de remonter encore) |
| `path.findParent(fn)` | remonte les ancêtres jusqu'à ce que `fn` réponde vrai |
| `path.node.start` / `.end` | décalages en octets dans le source — servent à `source.slice(start, end)` |
| `path.node.loc` | `{ start: {line, column}, end: {…} }` — l'emplacement lisible |

`findParent` **démarre au parent**, pas au nœud courant. C'est ce qui rend la garde de `cookie.ts` correcte : depuis le `MemberExpression` `document.cookie`, elle regarde l'`AssignmentExpression` juste au-dessus et vérifie que ce membre en est bien le `left`.

Le motif `if (!node.loc || node.start == null || node.end == null) return;` en tête de chaque analyseur n'est pas de la superstition : ces champs sont facultatifs dans les types Babel (un arbre construit à la main n'en a pas), et `source.slice(undefined, undefined)` rendrait le source entier.

---

## 9. Pourquoi `t.isIdentifier(node, { name: "cookie" })` et pas `node.name === "cookie"`

Deux raisons, l'une pratique, l'autre imposée par TypeScript.

**Pratique.** Le second argument est un filtre de champs superficiel : le helper vérifie le type **et** que chaque champ listé correspond. `t.isIdentifier(x, {name:"cookie"})` = « c'est un `Identifier` **et** son `name` vaut `"cookie"` ». En une expression, sans risque de lire `.name` sur un nœud qui n'en a pas.

**TypeScript.** C'est le sens du commentaire dans ton `cookie.ts` (« les check de type ts nous obligent à faire cela »). Le champ `left` d'une `AssignmentExpression` est typé comme une union large — motifs de déstructuration, identifiants, membres… Tant que le type n'est pas restreint, `left.object` n'existe pas pour le compilateur. Les helpers `t.isX` sont des **gardes de type** : après

```js
if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
```

le compilateur sait que dans la suite de la fonction `left` est un `MemberExpression | OptionalMemberExpression`, et `left.object` devient accessible. La sortie anticipée n'est pas une préférence de style, c'est ce qui débloque l'accès aux champs.

Corollaire à connaître : **`ThisExpression` n'est pas un `Identifier`.** Dans `this.onhashchange = f`, `left.object.type` vaut `ThisExpression`, et `t.isIdentifier` y répond `false`. Un test qui exige `t.isIdentifier(left.object)` écarte donc silencieusement tout ce qui passe par `this` — fréquent en code minifié ou dans du code de bibliothèque où le global est réintroduit via `this`.

---

## 10. La méthode : ancrer chaque nom à sa profondeur

Voilà la règle qui remplace la recopie de patron. Elle tient en trois gestes.

**Geste 1 — écrire la cible et compter les noms qui l'identifient.**

| Cible | Noms identifiants |
|---|---|
| `document.cookie` | **deux** : `document` et `cookie` |
| `x.onhashchange` | **un** : `onhashchange` |
| `x.addEventListener("hashchange", …)` | **deux**, mais dans deux branches : `addEventListener` et `"hashchange"` |

**Geste 2 — dessiner l'arbre et marquer où chaque nom atterrit.**

```
document.cookie = v                  x.onhashchange = v                  x.addEventListener("hashchange", f)

AssignmentExpression                 AssignmentExpression                CallExpression
└─ left MemberExpression             └─ left MemberExpression            ├─ callee MemberExpression
        ├─ object   ◄── "document"           ├─ object   ◄── (libre)     │         ├─ object   ◄── (libre)
        └─ property ◄── "cookie"             └─ property ◄── "onhash…"   │         └─ property ◄── "addEventListener"
                                                                         └─ arguments[0] ◄── "hashchange"
```

**Geste 3 — un test par ancre, chacune à sa position, et rien d'autre.** Une position laissée libre se teste par… rien. On n'y met surtout pas une ancre « en trop » pour faire comme dans un autre analyseur.

Ce que ça donne, cas par cas.

### `document.cookie` — deux ancres, deux profondeurs possibles pour la première

`document` peut être l'objet direct (`document.cookie`) ou lui-même une propriété (`window.document.cookie`, `a.b.document.cookie`). D'où deux branches — et c'est le patron de ton `cookie.ts`, qui passe 11/11 sur harnais :

```js
// branche A : document est un identifiant direct
(t.isIdentifier(left.object, { name: "document" }) && <property vaut cookie>)
// branche B : document est la propriété de l'objet parent
|| ((t.isMemberExpression(left.object) || t.isOptionalMemberExpression(left.object))
     && <left.object.property vaut document>
     && <left.property vaut cookie>)
```

Le point à ne jamais perdre de vue : **`left.property` vaut `cookie` dans les DEUX branches.** Les branches ne diffèrent que sur la façon de trouver `document`. Elles ne déplacent pas l'ancre `cookie`.

### `onhashchange` — une seule ancre

Une ancre, une position, donc une seule condition. Pas de branche B : elle n'a rien à chercher.

```js
<left.property vaut onhashchange>     // et c'est tout — left.object reste libre
```

Ce test couvre à lui seul `window.onhashchange`, `self.onhashchange`, `window.top.onhashchange`, `this.onhashchange`, `x.onhashchange`, quelle que soit la profondeur à gauche.

Le bug de la transposition se lit maintenant tout seul : en copiant la branche B de `cookie.ts`, l'ancre unique s'est retrouvée à la place de `document`, c'est-à-dire sur `left.object.property`, en laissant `left.property` libre. Ça ne décrit pas `window.top.onhashchange` — ça décrit `foo.onhashchange.bar`.

```
ce qui était visé                    ce que le test décrivait

window.top.onhashchange              foo.onhashchange.bar
        └─ property "onhashchange"      └─ object.property "onhashchange"
                                        └─ property "bar" (libre)
```

Reste le cas hors membre : `onhashchange = f` en portée globale (§ 2) est un `AssignmentExpression` dont le `left` est un `Identifier`. Il se traite avant la sortie anticipée, pas dedans.

### `addEventListener("hashchange", …)` — deux ancres dans deux branches

```js
<callee.property vaut addEventListener>
&& node.arguments.length >= 2
&& t.isStringLiteral(node.arguments[0], { value: "hashchange" })
```

`callee.object` reste libre : `window.`, `self.`, `document.`, `w.`, `this.` sont tous légitimes.

---

## 11. Les pièges qui restent après un test correct

Un test bien ancré est nécessaire, pas suffisant. Ce qu'un analyseur purement syntaxique, sans résolution de portée (c'est le cas ici : le marcheur n'a pas de résolution de liaisons), ne verra pas :

- **Aliasing.** `var d = document; d.cookie = x` — `d.cookie` n'a aucune ancre. Sortir de là demande un suivi de liaisons, pas un test de forme.
- **Nom calculé non constant.** `document[k]`, `el["on"+"hashchange"]`, `w[Q[3]]`. Sans évaluation partielle, invisibles.
- **Accès indirect.** `Object.defineProperty(window, "onhashchange", …)`, `Reflect.set(w, "onhashchange", f)`, `w.setAttribute("onhashchange", …)` — aucun `MemberExpression` portant le nom.
- **Handler posé en HTML.** `<body onhashchange="…">` n'est pas du JavaScript parsé par cet outil.
- **Minification.** Elle renomme les variables (donc les objets à gauche) mais **jamais** les propriétés des API du navigateur — `addEventListener`, `cookie`, `onhashchange` survivent intacts. C'est précisément pour ça que l'ancre doit porter sur la propriété et laisser l'objet libre : à droite du point, le nom est stable ; à gauche, il ne l'est pas.

Ce dernier point est plus qu'une astuce d'implémentation : c'est l'argument de fond pour la règle du § 10.

---

## 12. Voir l'arbre soi-même

C'est l'outil qui remplace la devinette. Depuis le dépôt (les dépendances Babel y sont) :

```bash
cd ~/Projects/jxscout-f && node -e '
const {parse}=require("@babel/parser");
const clean=(k,v)=>["start","end","loc","range","extra","leadingComments","trailingComments"].includes(k)?undefined:v;
console.log(JSON.stringify(parse(process.argv[1],{sourceType:"unambiguous"}).program.body[0],clean,2));
' 'window.top.onhashchange = f'
```

Remplace la dernière chaîne par n'importe quelle expression. Le filtre `clean` retire `start`/`end`/`loc`, sinon la sortie est trois fois plus longue que l'arbre lui-même.

Pour voir **quels visiteurs se déclenchent** sur une expression — la question qui tranche les histoires de `MemberExpression` contre `OptionalMemberExpression` :

```bash
cd ~/Projects/jxscout-f && node -e '
const {parse}=require("@babel/parser");
const traverse=require("@babel/traverse").default;
const seen=[];
const v=n=>()=>{seen.push(n)};   // accolades obligatoires — voir piège ci-dessous
traverse(parse(process.argv[1],{sourceType:"unambiguous"}),{
  MemberExpression:v("MemberExpression"),
  OptionalMemberExpression:v("OptionalMemberExpression"),
  CallExpression:v("CallExpression"),
  OptionalCallExpression:v("OptionalCallExpression"),
});
console.log(seen.join(", ")||"(aucun)");
' 'w?.document.cookie'
```

Sortie : `OptionalMemberExpression, OptionalMemberExpression` — la démonstration du § 7, point 2.

Trois pièges d'outillage, non évidents :

- Lancé depuis un autre répertoire, Node résout `@babel/*` par rapport au **script**, pas au répertoire courant : `ERR_MODULE_NOT_FOUND` même après un `cd` dans le dépôt. D'où le `cd` collé à la commande, ou des chemins absolus vers `node_modules`.
- `@babel/traverse` s'importe en `require(...).default` en CommonJS, ou `import _t from "@babel/traverse"` puis `_t.default ?? _t` en ESM. Le `.default` oublié donne un « traverse is not a function » sans rapport apparent.
- **Une fonction de visite ne doit rien retourner.** Babel lève `Unexpected return value from visitor method` — la valeur de retour lui est réservée. Une flèche concise `()=>seen.push(x)` renvoie implicitement le nouveau length du tableau et fait planter le parcours ; d'où les accolades dans la commande ci-dessus. (Rencontré en écrivant ce document.)

---

## 13. Aide-mémoire

| Ce que tu cherches | Où c'est dans l'arbre |
|---|---|
| `obj.NOM` | `MemberExpression.property` (`Identifier`, `computed: false`) |
| `obj["NOM"]` | `MemberExpression.property` (`StringLiteral`, `computed: true`) |
| l'objet porteur | `MemberExpression.object` — souvent un autre `MemberExpression` |
| `a.b.c` | deux `MemberExpression` imbriqués ; `c` est sur le nœud **extérieur** |
| une écriture | `AssignmentExpression.left` |
| une lecture | un `MemberExpression` dont le parent n'est pas une affectation sur `left` |
| une méthode appelée | `CallExpression.callee.property` |
| un argument d'appel | `CallExpression.arguments[i]` |
| `a?.b`, `a?.b()` | `OptionalMemberExpression`, `OptionalCallExpression` — types **distincts** |
| `this.x` | `object.type === "ThisExpression"`, pas un `Identifier` |
| une globale nue | `AssignmentExpression.left` est un `Identifier` — aucun `MemberExpression` |

**La phrase à garder :** un nom identifie une position dans l'arbre ; on le teste là où il est écrit, et nulle part ailleurs. Le nombre d'ancres est fixé par la cible, pas par l'analyseur voisin dont on copie la forme.
