import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const FETCH_ANALYZER_NAME = "fetch";

const fetchAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
      const node = path.node
      if (!node.loc || node.start == null || node.end == null) return;
  
    // Check if this is an fetch call
    const isFetchCall = (
      (t.isMemberExpression(node.callee) || t.isOptionalMemberExpression(node.callee)) 
      && ((t.isIdentifier(node.callee.property, { name: "fetch" }) && !node.callee.computed) || t.isStringLiteral(node.callee.property, { value: "fetch" }))
    )
      || t.isIdentifier(node.callee, { name: "fetch" })

      if (isFetchCall) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: FETCH_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "fetch-call": true,
          },
        };

        matchesReturn.push(match);
      }
    }
    return { CallExpression: handle, OptionalCallExpression: handle };
  };


export { fetchAnalyzerBuilder };
