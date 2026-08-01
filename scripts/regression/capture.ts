/**
 * @author [A likely boring stuff made by] Shevek
 * @desc capture.ts — Exécute l'analyzer AST sur chaque fichier d'un corpus figé et enregistre
 *       sa sortie JSON, sa durée et l'empreinte du fichier source. Produit la référence
 *       contre laquelle un portage (oxc -> babel) sera comparé.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

/** Une entrée du manifeste : ce qu'on sait d'un fichier du corpus après capture. */
type ManifestEntry = {
  /** Nom du fichier dans corpus/ (nom aplati, sert aussi de clé de comparaison). */
  name: string;
  /** Taille du source en octets. */
  bytes: number;
  /** SHA-256 du source, pour détecter qu'un fichier du corpus a bougé. */
  sha256: string;
  /** Durée du run de l'analyzer, en millisecondes. */
  ms: number;
  /** Nombre de matches renvoyés, ou null si le run a échoué. */
  matches: number | null;
  /** Message d'erreur si le run a échoué, sinon null. */
  error: string | null;
};

/**
 * @brief Calcule le SHA-256 d'un fichier.
 * @param path Chemin absolu du fichier.
 * @return L'empreinte en hexadécimal.
 */
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * @brief Lance l'analyzer AST sur un fichier et récupère sa sortie brute.
 * @param analyzerPath Chemin du bundle ast-analyzer.js à exécuter.
 * @param nativePath Chemin du binding natif oxc, ou null si l'analyzer n'en a pas besoin.
 * @param target Chemin absolu du fichier à analyser.
 * @return stdout, stderr et code de sortie du process.
 *
 * L'analyzer est un CLI one-shot : un fichier en argv, du JSON sur stdout. On reproduit ici
 * exactement l'invocation du Go (internal/modules/ast-analyzer/module.go), y compris la
 * variable NAPI_RS_NATIVE_LIBRARY_PATH sans laquelle le bundle ne charge pas son parser.
 */
function runAnalyzer(
  analyzerPath: string,
  nativePath: string | null,
  target: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((done) => {
    const env = { ...process.env };
    if (nativePath) env.NAPI_RS_NATIVE_LIBRARY_PATH = nativePath;

    const child = spawn("bun", ["run", analyzerPath, target], { env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (code) => done({ stdout, stderr, code: code ?? -1 }));
  });
}

/**
 * @brief Normalise une sortie d'analyzer pour la rendre comparable d'un run à l'autre.
 * @param raw La chaîne JSON produite par l'analyzer.
 * @param corpusName Nom aplati du fichier dans le corpus.
 * @return Le tableau de matches trié, ou null si la sortie n'est pas du JSON exploitable.
 *
 * Deux retouches, et seulement deux. Le champ filePath est réécrit avec le nom du corpus :
 * il contient un chemin absolu qui diffère d'une machine à l'autre et polluerait le diff.
 * Les matches sont triés sur une clé stable, parce que rien ne garantit que deux
 * implémentations du parcours d'arbre les émettent dans le même ordre — et cet ordre-là
 * n'est pas ce qu'on cherche à vérifier.
 */
function normalize(raw: string, corpusName: string): any[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  for (const m of parsed) if (m && typeof m === "object") m.filePath = corpusName;

  return parsed.sort((a, b) => {
    const key = (m: any) =>
      `${m?.analyzerName}|${m?.start?.line}|${m?.start?.column}|${m?.value}`;
    return key(a).localeCompare(key(b));
  });
}

async function main() {
  const root = process.env.JXSCOUT_REGRESSION_DIR ?? join(process.env.HOME!, "jxscout-regression");
  const corpusDir = join(root, "corpus");
  const outDir = resolve(process.argv[2] ?? join(root, "baseline"));

  // Par défaut on capture avec le bundle de production. Passer JXSCOUT_ANALYZER pour viser
  // une autre implémentation (le TS source, ou un futur portage babel) et comparer les deux.
  const repoRoot = resolve(import.meta.dir, "..", "..");
  const analyzer =
    process.env.JXSCOUT_ANALYZER ??
    join(repoRoot, "internal", "modules", "ast-analyzer", "ast-analyzer.js");
  const native =
    process.env.JXSCOUT_NATIVE_PARSER ??
    join(repoRoot, "internal", "modules", "ast-analyzer", "parser.linux-x64-gnu.node");

  if (!existsSync(corpusDir)) {
    console.error(`Corpus introuvable : ${corpusDir}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".js")).sort();
  console.error(`Corpus  : ${corpusDir} (${files.length} fichiers)`);
  console.error(`Analyzer: ${analyzer}`);
  console.error(`Sortie  : ${outDir}\n`);

  const manifest: ManifestEntry[] = [];

  for (const name of files) {
    const src = join(corpusDir, name);
    const bytes = statSync(src).size;
    const t0 = performance.now();
    const { stdout, stderr, code } = await runAnalyzer(analyzer, existsSync(native) ? native : null, src);
    const ms = Math.round(performance.now() - t0);

    const matches = code === 0 ? normalize(stdout, name) : null;
    const error =
      code !== 0
        ? `exit ${code}: ${stderr.trim().slice(0, 300)}`
        : matches === null
          ? `sortie non-JSON (${stdout.length} octets)`
          : null;

    if (matches) {
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(matches, null, 2));
    }

    manifest.push({ name, bytes, sha256: sha256(src), ms, matches: matches?.length ?? null, error });

    const verdict = error ? `ÉCHEC — ${error}` : `${matches!.length} matches`;
    console.error(`${String(ms).padStart(6)} ms  ${String(bytes).padStart(9)} o  ${verdict}  ${name}`);
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const ok = manifest.filter((e) => !e.error);
  const totalMs = manifest.reduce((s, e) => s + e.ms, 0);
  console.error(
    `\n${ok.length}/${manifest.length} fichiers analysés, ` +
      `${ok.reduce((s, e) => s + (e.matches ?? 0), 0)} matches au total, ` +
      `${(totalMs / 1000).toFixed(1)} s cumulées.`
  );
  if (ok.length < manifest.length) {
    console.error(`${manifest.length - ok.length} échec(s) — voir manifest.json.`);
  }
}

main();
