import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const LOCAL_STORAGE_ANALYZER_NAME = "local-storage";

const localStorageAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;
    const callee = path.node.callee
    if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return;
    const obj = callee.object
    const isLocalStorageCall =
      t.isIdentifier(obj, { name: "localStorage" })
      || ((t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
      && ((t.isIdentifier(obj.property, { name: "localStorage" }) && !obj.computed)
      || t.isStringLiteral(obj.property, { value: "localStorage" })));

    if (isLocalStorageCall) {
      const localStorageMethod = t.isIdentifier(callee.property) && !callee.computed ? callee.property.name
      : t.isStringLiteral(callee.property) ? callee.property.value
      : "dynamic";
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: LOCAL_STORAGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          "local-storage": true,
          [`property-${localStorageMethod}`]: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { CallExpression: handle, OptionalCallExpression: handle };
};


export { localStorageAnalyzerBuilder };
