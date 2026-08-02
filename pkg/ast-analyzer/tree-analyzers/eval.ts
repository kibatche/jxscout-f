import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const EVAL_ANALYZER_NAME = "eval";

const evalAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;
    const isEvalCall = (
      (t.isMemberExpression(node.callee) || t.isOptionalMemberExpression(node.callee))
      && ((t.isIdentifier(node.callee.property, { name: "eval" }) && !node.callee.computed) || t.isStringLiteral(node.callee.property, { value: "eval" }))
    )
      || t.isIdentifier(node.callee, { name: "eval" })
      || (t.isSequenceExpression(node.callee)
        && t.isIdentifier(node.callee.expressions.at(-1), { name: "eval" }))
    // Check if this is an eval call
    if (isEvalCall && node.arguments.length >= 1) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: EVAL_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          eval: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { CallExpression: handle, OptionalCallExpression: handle };
}

export { evalAnalyzerBuilder };
