import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const URL_SEARCH_PARAMS_ANALYZER_NAME = "url-search-params";

const urlSearchParamsAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handleNewExpression = (path: NodePath<t.NewExpression>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;
    const callee = node.callee

    const isURLSearchParams =
    t.isIdentifier(callee, {name: "URLSearchParams"})
    || (
        (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee))
        && ((t.isIdentifier(callee.property, {name: "URLSearchParams"}) && !callee.computed)
            || t.isStringLiteral(callee.property, {value: "URLSearchParams"}))
        )

    // Check for URLSearchParams constructor
    if (isURLSearchParams) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: URL_SEARCH_PARAMS_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          "url-search-params": true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { NewExpression: handleNewExpression }
};


export { urlSearchParamsAnalyzerBuilder };
