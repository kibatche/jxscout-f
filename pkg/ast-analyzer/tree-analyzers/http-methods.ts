import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";
import { getBinaryExpressionStr, getConcatCallExprStr, getTemplateLiteralStr, isConcatCallExpr, isValidPath } from "./robust-paths";

export const HTTP_METHODS_ANALYZER_NAME = "http-methods";

const HTTP_METHODS = new Set(["post", "delete", "get", "put", "patch"]);

function createHttpMethodMatch(
  args: AnalyzerParams,
  path: NodePath<t.CallExpression | t.OptionalCallExpression>,
  methodName: string
): AnalyzerMatch {
  const node = path.node

  return {
    filePath: args.filePath,
    analyzerName: HTTP_METHODS_ANALYZER_NAME,
    value: args.source.slice(node.start!, node.end!),
    start: node.loc!.start,
    end: node.loc!.end,
    tags: {
      [`method-${methodName}`]: true,
      "http-method": true,
    },
    extra: {
      method: methodName,
    },
  };
}

const httpMethodsAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handleCallExpression = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;

    if (!t.isMemberExpression(node.callee) && !t.isOptionalMemberExpression(node.callee)) return;
    const isHttpMethodCallExpression =
      ((t.isIdentifier(node.callee.property) && !node.callee.computed && HTTP_METHODS.has(node.callee.property.name))
        || (t.isStringLiteral(node.callee.property) && HTTP_METHODS.has(node.callee.property.value)))
    
    if (!isHttpMethodCallExpression) return;
    
    let hasValidPath = false
    node.arguments.forEach(a => {
      if (t.isStringLiteral(a) && isValidPath(a.value)) {
        return hasValidPath = true
      } else if ((t.isCallExpression(a) || t.isOptionalCallExpression(a)) && isConcatCallExpr(a) && isValidPath(getConcatCallExprStr(a))) {
        return hasValidPath = true
      } else if (t.isBinaryExpression(a) && isValidPath(getBinaryExpressionStr(a))) {
        return hasValidPath = true
      } else if (t.isTemplateLiteral(a) && isValidPath(getTemplateLiteralStr(a))) {
        return hasValidPath = true
      }
    })
    if (hasValidPath) {
      if (t.isIdentifier(node.callee.property)) {
        matchesReturn.push(
          createHttpMethodMatch(args, path, node.callee.property.name)
        )
      } else if (t.isStringLiteral(node.callee.property)) {
        matchesReturn.push(
          createHttpMethodMatch(args, path, node.callee.property.value)
        );
      }
    }
  }
  return { CallExpression: handleCallExpression, OptionalCallExpression: handleCallExpression }
};


export { httpMethodsAnalyzerBuilder };
