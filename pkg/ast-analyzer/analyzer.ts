import fs from "fs";

import Bun from "bun"
import * as parser from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import cache from "@babel/traverse";
import { File } from '@babel/types';

import { AnalyzerParams, AnalyzerMatch } from "./types";
import { regexAnalyzerBuilder } from "./tree-analyzers/regex-pattern";
import { graphqlAnalyzerBuilder } from "./tree-analyzers/graphql";
import { secretsAnalyzerBuilder } from "./tree-analyzers/secrets";
import { addEventListenerAnalyzerBuilder } from "./tree-analyzers/add-event-listener";
import { cookieAnalyzerBuilder } from "./tree-analyzers/cookie";
import { documentDomainAnalyzerBuilder } from "./tree-analyzers/document-domain";
import { evalAnalyzerBuilder } from "./tree-analyzers/eval";
import { fetchOptionsAnalyzerBuilder } from "./tree-analyzers/fetch-options";
import { fetchAnalyzerBuilder } from "./tree-analyzers/fetch";
import { hostnameAnalyzerBuilder } from "./tree-analyzers/hostname";
import { innerHTMLAnalyzerBuilder } from "./tree-analyzers/inner-html";
import { localStorageAnalyzerBuilder } from "./tree-analyzers/local-storage";
import { locationAnalyzerBuilder } from "./tree-analyzers/location";
import { onhashchangeAnalyzerBuilder } from "./tree-analyzers/onhashchange";
import { onmessageAnalyzerBuilder } from "./tree-analyzers/onmessage";
import { postmessageAnalyzerBuilder } from "./tree-analyzers/postmessage";
import { regexMatchAnalyzerBuilder } from "./tree-analyzers/regex-match";
import { sessionStorageAnalyzerBuilder } from "./tree-analyzers/session-storage";
import { urlSearchParamsAnalyzerBuilder } from "./tree-analyzers/url-search-params";
import { robustPathsAnalyzerBuilder } from "./tree-analyzers/robust-paths";
import { windowNameAnalyzerBuilder } from "./tree-analyzers/window-name";
import { windowOpenAnalyzerBuilder } from "./tree-analyzers/window-open";
import { dangerousHtmlAnalyzerBuilder } from "./tree-analyzers/react-dangerously-set-inner-html";
import { httpMethodsAnalyzerBuilder } from "./tree-analyzers/http-methods";

export async function parseFile(filePath: string): Promise<AnalyzerParams> {
  const file = Bun.file(filePath);
  const fileContent = await file.text()  
  let fileExtension = filePath.split('.').pop()
  let ast: parser.ParseResult<File>
  
  switch(fileExtension) {
    case "ts":
      ast = parser.parse(fileContent, {
      sourceType: "unambiguous", errorRecovery: true,
      plugins: ["typescript"] });
      break;
    case "jsx":
      ast = parser.parse(fileContent, {
      sourceType: "unambiguous", errorRecovery: true,
      plugins: ["jsx"] });
      break;
    case "js":
    case "mjs":
    case "cjs":
      ast = parser.parse(fileContent, {
      sourceType: "unambiguous", errorRecovery: true,
      plugins: ["jsx"] });
      break;
    default:
      ast = parser.parse(fileContent, {
      sourceType: "unambiguous", errorRecovery: true,
      plugins: ["typescript", "jsx"] });
  }
  // Ecris sur l'erreur et pour l'instant le programme 

  // ast.errors?.map(error => {
  //     console.warn(`[WARNING @babel/parse]: ${error}`)
  //   })
  return { ast: ast, source: fileContent, filePath };
}

export type AnalyzerType =
  | "emails"
  | "postmessage"
  | "message-listener"
  | "regex-match"
  | "hash-change"
  | "regex"
  | "dom-xss"
  | "graphql"
  | "urls"
  | "jquery-dom-xss"
  | "open-redirection"
  | "cookie-manipulation"
  | "javascript-injection"
  | "document-domain-manipulation"
  | "websocket-url-poisoning"
  | "link-manipulation"
  | "ajax-request-header-manipulation"
  | "local-file-path-manipulation"
  | "html5-storage-manipulation"
  | "xpath-injection"
  | "dom-data-manipulation"
  | "common-sources"
  | "secrets"
  | "pii"
  | "extensions"
  | "add-event-listener"
  | "cookie"
  | "document-domain"
  | "eval"
  | "fetch-options"
  | "fetch"
  | "hostname"
  | "inner-html"
  | "local-storage"
  | "session-storage"
  | "location"
  | "onhashchange"
  | "onmessage"
  | "regex-pattern"
  | "url-search-params"
  | "paths"
  | "robust-paths"
  | "window-name"
  | "window-open"
  | "dangerous-html"
  | "http-methods";

export async function analyzeFile(
  filePath: string,
  analyzersToRun?: AnalyzerType[]
): Promise<AnalyzerMatch[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Error: File not found: ${filePath}`);
  }

  const results: AnalyzerMatch[] = [];
  const args = await parseFile(filePath);

  const createAnalyzer = <T extends { [key: string]: any }>(
    type: AnalyzerType,
    builder: (args: AnalyzerParams, results: AnalyzerMatch[]) => T
  ): T | null => {
    if (analyzersToRun && !analyzersToRun.includes(type)) {
      return null;
    }
    return builder(args, results);
  };

  const postMessageAnalyzer = createAnalyzer(
    "postmessage",
    postmessageAnalyzerBuilder
  );
  const regexAnalyzer = createAnalyzer("regex", regexAnalyzerBuilder);
  const graphqlAnalyzer = createAnalyzer("graphql", graphqlAnalyzerBuilder);
  const secretsAnalyzer = createAnalyzer("secrets", secretsAnalyzerBuilder);
  const addEventListenerAnalyzer = createAnalyzer(
    "add-event-listener",
    addEventListenerAnalyzerBuilder
  );
  const cookieAnalyzer = createAnalyzer("cookie", cookieAnalyzerBuilder);
  const documentDomainAnalyzer = createAnalyzer(
    "document-domain",
    documentDomainAnalyzerBuilder
  );
  const evalAnalyzer = createAnalyzer("eval", evalAnalyzerBuilder);
  const fetchOptionsAnalyzer = createAnalyzer(
    "fetch-options",
    fetchOptionsAnalyzerBuilder
  );
  const fetchAnalyzer = createAnalyzer("fetch", fetchAnalyzerBuilder);
  const hostnameAnalyzer = createAnalyzer("hostname", hostnameAnalyzerBuilder);
  const innerHtmlAnalyzer = createAnalyzer(
    "inner-html",
    innerHTMLAnalyzerBuilder
  );
  const localStorageAnalyzer = createAnalyzer(
    "local-storage",
    localStorageAnalyzerBuilder
  );
  const sessionStorageAnalyzer = createAnalyzer(
    "session-storage",
    sessionStorageAnalyzerBuilder
  );
  const locationAnalyzer = createAnalyzer("location", locationAnalyzerBuilder);
  const onhashchangeAnalyzer = createAnalyzer(
    "onhashchange",
    onhashchangeAnalyzerBuilder
  );
  const onmessageAnalyzer = createAnalyzer(
    "onmessage",
    onmessageAnalyzerBuilder
  );
  const regexMatchAnalyzer = createAnalyzer(
    "regex-match",
    regexMatchAnalyzerBuilder
  );

  const urlSearchParamsAnalyzer = createAnalyzer(
    "url-search-params",
    urlSearchParamsAnalyzerBuilder
  );
  const robustPathsAnalyzer = createAnalyzer(
    "robust-paths",
    robustPathsAnalyzerBuilder
  );
  const windowNameAnalyzer = createAnalyzer(
    "window-name",
    windowNameAnalyzerBuilder
  );
  const windowOpenAnalyzer = createAnalyzer(
    "window-open",
    windowOpenAnalyzerBuilder
  );
  const dangerousHtmlAnalyzer = createAnalyzer(
    "dangerous-html",
    dangerousHtmlAnalyzerBuilder
  );
  const httpMethodsAnalyzer = createAnalyzer(
    "http-methods",
    httpMethodsAnalyzerBuilder
  );
  const analyzers = [
    postMessageAnalyzer,//done
    regexAnalyzer,//done
    graphqlAnalyzer,// done
    secretsAnalyzer,//done
    addEventListenerAnalyzer,//done
    cookieAnalyzer,//done
    documentDomainAnalyzer,//done
    evalAnalyzer,//done
    fetchOptionsAnalyzer,//done
    fetchAnalyzer,//done
    hostnameAnalyzer,//done
    innerHtmlAnalyzer,//done
    localStorageAnalyzer,//done
    sessionStorageAnalyzer,//done
    locationAnalyzer,//done
    onhashchangeAnalyzer,//done
    onmessageAnalyzer,// done
    regexMatchAnalyzer,// done
    urlSearchParamsAnalyzer,// done
    robustPathsAnalyzer,
    windowNameAnalyzer,
    windowOpenAnalyzer,
    dangerousHtmlAnalyzer,
    httpMethodsAnalyzer
  ].filter((visitor) => visitor != null);
  // tip de claudo : permet de merge le tableau d'analyzer, en une seule passe et une seul ligne.
  // Babel est vraiment meilleur que oxc sur les méthodes de confort.
  traverse(args.ast, traverse.visitors.merge(analyzers));
  return results;
}
