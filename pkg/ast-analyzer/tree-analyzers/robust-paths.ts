import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";
import { COMMON_MIME_TYPES, FILE_EXTENSIONS } from "../constant/iana-tld";
import { BinaryExpression } from "@babel/types";



function isHighEntropy(str: string, threshold = 4.9): boolean {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }

  return entropy >= threshold;
}

// most logic stolen from https://github.com/BishopFox/jsluice
// all credit to them

export const ROBUST_PATHS_ANALYZER_NAME = "robust-paths";



const hostnamesToExclude = new Set(["www.w3.org", "reactjs.org"]);

function containsAny(str: string, chars: string): boolean {
  return chars.split("").some((char) => str.includes(char));
}

function hasPrefix(str: string, prefix: string): boolean {
  return str.startsWith(prefix);
}

export function isValidPath(value: string): boolean {
  // Check if path starts with a letter or forward slash
  if (!/^[a-zA-Z/]/.test(value)) {
    return false;
  }

  // Check if path contains at least one letter
  if (!/[a-zA-Z]/.test(value)) {
    return false;
  }

  // Basic path-like check
  if (!value.includes("/")) {
    return false;
  }

  // Exclude strings with special characters
  if (containsAny(value, " ()!<>'\"`{}^$,")) {
    return false;
  }

  // Exclude paths that are just "./" or "../"
  if (/^\.\.?\/?$/.test(value)) {
    return false;
  }

  // Exclude paths that end with a slash and have no actual path content
  if (/^[^/]*\/$/.test(value)) {
    return false;
  }

  // Check if at least one path segment is longer than 3 characters
  const parts = value.split("/").filter(Boolean);
  if (!parts.some((part) => part.length >= 3)) {
    return false;
  }

  // If all parts are just "EXPR", it's not a valid path
  if (
    parts.every(
      (part) =>
        part.startsWith("EXPR") ||
        (part.startsWith("EXPR") && part.endsWith("EXPR"))
    )
  ) {
    return false;
  }

  // Paths starting with slash are likely valid
  if (hasPrefix(value, "/") && !value.startsWith("//")) {
    return true;
  }

  // Try to parse as URL first
  if (value.includes("://") || value.startsWith("//")) {
    try {
      const url = new URL(value.startsWith("//") ? `http:${value}` : value);

      // Check scheme
      const scheme = url.protocol.toLowerCase().replace(":", "");
      if (scheme !== "http" && scheme !== "https") {
        return false;
      }

      if (hostnamesToExclude.has(url.hostname)) {
        return false;
      }

      // Check hostname
      if (url.hostname.split(".").length > 1) {
        return true;
      }

      // Check query parameters
      if (url.searchParams.toString()) {
        return true;
      }

      // Check for file extension
      if (containsAny(url.pathname, ".")) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  const isHostname =
    value.includes(".") && value.indexOf(".") < value.indexOf("/");

  try {
    let url: URL | null = null;
    if (isHostname) {
      url = new URL(`https://${value}`);
    } else {
      url = new URL(value, "http://randombase.com");
    }

    if (hostnamesToExclude.has(url.hostname)) {
      return false;
    }

    if (
      isHostname &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === ""
    ) {
      return false;
    }
  } catch (e) { void e }

  // For relative paths, check if they have a valid structure
  if (parts.length === 0) {
    return false;
  }

  // Check if any part contains a dot (potential file extension)
  if (containsAny(value, ".")) {
    return true;
  }

  // Check if it has query parameters
  if (value.includes("?")) {
    return true;
  }

  if (isHighEntropy(value)) {
    return false;
  }

  // If it has multiple segments, it's likely a path
  return true;
}

function getFileExtension(url: URL | null): string | null {
  if (!url) return null;

  const lastDotIndex = url.pathname.lastIndexOf(".");
  if (lastDotIndex === -1) return null;

  const extension = url.pathname.slice(lastDotIndex).toLowerCase();
  return FILE_EXTENSIONS.has(extension) ? extension.replace(".", "") : null;
}

function processStringConcatenation(node: t.BinaryExpression | t.CallExpression | t.StringLiteral): string {
  if (!node) return "";
  if (
    t.isBinaryExpression(node) &&
    node.operator === "+"
  ) {
    const left = processStringConcatenation(node.left as t.BinaryExpression);
    const right = processStringConcatenation(node.right as t.BinaryExpression);
    return left + right;
  } else if (t.isStringLiteral(node)) {
    return node.value
  }
  return "EXPR";
}

function createPathMatch(
  args: AnalyzerParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  path: NodePath<any>,
  value: string,
  isTemplate = false,
  processedValue: string
): AnalyzerMatch {
  const node = path.node
  let isUrl = processedValue.includes("://") || processedValue.startsWith("//");
  let isUrlOnly = false;

  let parsedUrl: URL | null = null;
  try {
    if (isUrl) {
      let url = processedValue;
      if (processedValue.startsWith("//")) {
        url = `http:${processedValue}`;
      }

      parsedUrl = new URL(url);
    } else if (
      processedValue.includes(".") &&
      processedValue.indexOf(".") < processedValue.indexOf("/")
    ) {
      isUrl = true;
      parsedUrl = new URL(`http://${processedValue}`);
    } else {
      parsedUrl = new URL(processedValue, "http://randombase.com");
    }
  } catch (e) { void e }

  if (
    isUrl &&
    (parsedUrl?.pathname === "" || parsedUrl?.pathname === "/") &&
    parsedUrl?.search === "" &&
    parsedUrl?.hash === ""
  ) {
    isUrlOnly = true;
  }

  const extension = getFileExtension(parsedUrl);
  let isMimeType = false;

  for (const mimeType of COMMON_MIME_TYPES) {
    if (processedValue.includes(mimeType)) {
      isMimeType = true;
      break;
    }
  }

  const isAPIPath =
    processedValue.includes("/api") || processedValue.includes("api/");

  const isAPI = processedValue.includes("api.") || isAPIPath;

  const isPathOnly = !isUrl && !isMimeType;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extra: Record<string, any> = {};

  if (parsedUrl) {
    if (isUrl) {
      if (parsedUrl.hostname) {
        extra["hostname"] = parsedUrl.hostname;
      }
      if (parsedUrl.port) {
        extra["port"] = parsedUrl.port;
      }
      if (parsedUrl.pathname) {
        extra["pathname"] = parsedUrl.pathname;
      }
      if (parsedUrl.searchParams.toString()) {
        extra["query-params"] = parsedUrl.searchParams.toString();
      }
      if (parsedUrl.hash) {
        extra["hash"] = parsedUrl.hash;
      }
    } else if (isPathOnly) {
      if (parsedUrl.pathname) {
        extra["pathname"] = parsedUrl.pathname;
      }
      if (parsedUrl.searchParams.toString()) {
        extra["query-params"] = parsedUrl.searchParams.toString();
      }
      if (parsedUrl.hash) {
        extra["hash"] = parsedUrl.hash;
      }
    }
  }

  return {
    filePath: args.filePath,
    analyzerName: ROBUST_PATHS_ANALYZER_NAME,
    value: isTemplate ? value : args.source.slice(node.start, node.end),
    start: node.loc!.start,
    end: node.loc!.end,
    tags: {
      ...(isMimeType && { "mime-type": true }),
      ...(extension && { [`extension-${extension}`]: true }),
      ...(extension && { "is-extension": true }),
      ...(isUrl && !isUrlOnly && { "is-url": true }),
      ...(isUrlOnly && { "is-url-only": true }),
      ...(isPathOnly && { "is-path-only": true }),
      ...(isAPI && { api: true }),
      ...(processedValue.includes("?") && { query: true }),
      ...(processedValue.includes("#") && { fragment: true }),
    },
    extra,
  };
}

export function getTemplateLiteralStr(node: t.TemplateLiteral) {
  return node.quasis.map(q => {
    return q.value.cooked ?? q.value.raw
  }).join("EXPR")
}

export function getBinaryExpressionStr(node: t.BinaryExpression) {
  return processStringConcatenation(node)
}

export function isConcatCallExpr(node: t.CallExpression | t.OptionalCallExpression) {
  if (!t.isMemberExpression(node.callee) && !t.isOptionalMemberExpression(node.callee)) return false;
  return ((t.isIdentifier(node.callee.property, { name: "concat" }) && !node.callee.computed) || t.isStringLiteral(node.callee.property, { value: "concat" }))
}

export function getConcatCallExprStr(node: t.CallExpression | t.OptionalCallExpression) {
  if (!t.isMemberExpression(node.callee) && !t.isOptionalMemberExpression(node.callee)) return "";
  const base = t.isStringLiteral(node.callee.object) ? node.callee.object.value : "EXPR"
  const argumentStr = node.arguments.map(a => {
    return t.isStringLiteral(a) ? a.value : "EXPR"
  }).join("")
  return base + argumentStr
}

const robustPathsAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {

  // du type "/api/admin/id"
  const handleStringLiteral = (path: NodePath<t.StringLiteral>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;

    if (path.findParent(p => p.isImportDeclaration())) return;

    if (isValidPath(node.value)) {
      matchesReturn.push(createPathMatch(args, path, node.value, false, node.value));
    }
  };

  // du type "/admin/${e}/id"
  const handleTemplateLiteral = (path: NodePath<t.TemplateLiteral>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;

    const processedValueEval = path.evaluate()
    let processedValue
    if (processedValueEval.confident == true) { processedValue = processedValueEval.value }
    else {
      processedValue = getTemplateLiteralStr(node)
    }
    // Get the raw template literal value and process expressions
    const rawValue = args.source
      .slice(node.start, node.end)
      .replaceAll("`", "");
    if (isValidPath(processedValue)) {
      matchesReturn.push(
        createPathMatch(args, path, rawValue, true, processedValue)
      );
    }
  };

  const handleBinaryExpression = (path: NodePath<BinaryExpression>) => {
    const node = path.node

    if (node.operator === "+") {
      let processedValue
      const processedValueEval = path.evaluate()
      if (processedValueEval.confident == true) { processedValue = processedValueEval.value }
      else {
        processedValue = getBinaryExpressionStr(node)
      }
      if (isValidPath(processedValue)) {
        matchesReturn.push(
          createPathMatch(args, path, processedValue, false, processedValue)
        );
        path.skip()
      }
    }
  };

  const handleCallExpression = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node

    if (!t.isMemberExpression(node.callee) && !t.isOptionalMemberExpression(node.callee)) return;

    if (isConcatCallExpr(node)) {
      let processedValue
      const processedValueEval = path.evaluate()
      if (processedValueEval.confident == true) { processedValue = processedValueEval.value }
      else {
        processedValue = getConcatCallExprStr(node)
      }
      if (isValidPath(processedValue)) {
        matchesReturn.push(
          createPathMatch(args, path, processedValue, false, processedValue)
        );
        path.skip()//trick de claudo qui permet de ne pas répéter une valeur déjà vue.
      }
    }
  }
  return { StringLiteral: handleStringLiteral, TemplateLiteral: handleTemplateLiteral, BinaryExpression: handleBinaryExpression, CallExpression: handleCallExpression, OptionalCallExpression: handleCallExpression }
};



export { robustPathsAnalyzerBuilder };
