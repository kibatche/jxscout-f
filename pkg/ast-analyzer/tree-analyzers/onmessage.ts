import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const ONMESSAGE_ANALYZER_NAME = "onmessage";

const onmessageAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handleAssignment = (path: NodePath<t.AssignmentExpression>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;
    const left = node.left

    //cas où on a juste "onmessage = truc", on doit return directement.
    // sinon le test suivant sur la présence d'un memberExpression invalide cette écriture pourtant valide.
    const isOnlyOnmessageAssignment = t.isIdentifier(left, { name: "onmessage" })
    if (isOnlyOnmessageAssignment) {
      matchesReturn.push({
        filePath: args.filePath,
        analyzerName: ONMESSAGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onmessage: true,
        },
      });
      return;
    };
    if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
    const isOnmessageAssignment =
      (((t.isIdentifier(left.property, { name: "onmessage" }) && !left.computed)// cas où whatever.onmessage = truc ou whatever.whatever.onmessage = truc
        || t.isStringLiteral(left.property, { value: "onmessage" })))// cas où whatever['onmessage'] = truc

    // Check if this is an onmessage assignment
    if (isOnmessageAssignment) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: ONMESSAGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onmessage: true,
        },
      };

      matchesReturn.push(match);
    }
  };
  const handleCallExpression = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;
    const callee = path.node.callee
    if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return;
    // Check if this is an addEventListener call with "message" event
    const isAddEventListenerWithmessage =
      path.node.arguments.length > 1
      && ((t.isIdentifier(callee.property, { name: "addEventListener" }) && !callee.computed) || t.isStringLiteral(callee.property, { value: "addEventListener" }))
      && t.isStringLiteral(path.node.arguments[0], { value: "message" })

    if (isAddEventListenerWithmessage) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: ONMESSAGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onmessage: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { AssignmentExpression: handleAssignment, CallExpression: handleCallExpression, OptionalCallExpression: handleCallExpression };
};

export { onmessageAnalyzerBuilder };
