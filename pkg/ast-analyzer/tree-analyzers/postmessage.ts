import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const POSTMESSAGE_ANALYZER_NAME = "postmessage";

const postmessageAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
    const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
      const node = path.node
      if (!node.loc || node.start == null || node.end == null) return;
  
      // Check if this is an postMessage call
      const isPostMessageCall = (
        (t.isMemberExpression(node.callee) || t.isOptionalMemberExpression(node.callee)) 
        && ((t.isIdentifier(node.callee.property, { name: "postMessage" })&& !node.callee.computed) || t.isStringLiteral(node.callee.property, { value: "postMessage" }))
      )
        || t.isIdentifier(node.callee, { name: "postMessage" })
  
      if (isPostMessageCall && node.arguments.length >= 1) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: POSTMESSAGE_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            postMessage: true,
          },
        };

        matchesReturn.push(match);
      }
    }
    return {CallExpression: handle, OptionalCallExpression: handle}
  };


export { postmessageAnalyzerBuilder };
