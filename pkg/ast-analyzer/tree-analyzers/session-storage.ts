import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const SESSION_STORAGE_ANALYZER_NAME = "session-storage";

const sessionStorageAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;
    const callee = path.node.callee
    if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return;
    const obj = callee.object
    const issessionStorageCall =
      t.isIdentifier(obj, { name: "sessionStorage" })
      || ((t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
        && ((t.isIdentifier(obj.property, { name: "sessionStorage" }) && !obj.computed)
          || t.isStringLiteral(obj.property, { value: "sessionStorage" })));

    if (issessionStorageCall) {
      const sessionStorageMethod = t.isIdentifier(callee.property) && !callee.computed ? callee.property.name
        : t.isStringLiteral(callee.property) ? callee.property.value
          : "dynamic";
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: SESSION_STORAGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          "session-storage": true,
          [`property-${sessionStorageMethod}`]: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { CallExpression: handle, OptionalCallExpression: handle };
};


export { sessionStorageAnalyzerBuilder };
