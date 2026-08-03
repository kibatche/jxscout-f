import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const ONHASHCHANGE_ANALYZER_NAME = "onhashchange";

const onhashchangeAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handleAssignment = (path: NodePath<t.AssignmentExpression>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;
    const left = node.left

    //cas où on a juste "onhashchange = truc", on doit return directement.
    // sinon le test suivant sur la présence d'un memberExpression invalide cette écriture pourtant valide.
    const isOnlyOnhashchangeAssignment = t.isIdentifier(left, {name: "onhashchange"})
    if (isOnlyOnhashchangeAssignment) { 
      matchesReturn.push({
        filePath: args.filePath,
        analyzerName: ONHASHCHANGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onhashchange: true,
        },
      });
      return;
     };
    if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
    const isOnhashchangeAssignment =
    (((t.isIdentifier(left.property, {name: "onhashchange"}) && !left.computed)// cas où whatever.onhashchange = truc ou whatever.whatever.onhashchange = truc
        || t.isStringLiteral(left.property, {value: "onhashchange"})))// cas où whatever['onhashchange'] = truc

    // Check if this is an onhashchange assignment
    if (isOnhashchangeAssignment) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: ONHASHCHANGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onhashchange: true,
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
    // Check if this is an addEventListener call with "hashchange" event
    const isAddEventListenerWithHashchange =
    path.node.arguments.length > 1
      &&((t.isIdentifier(callee.property, {name: "addEventListener"}) && !callee.computed) || t.isStringLiteral(callee.property, {value: "addEventListener"}))
        && t.isStringLiteral(path.node.arguments[0], {value: "hashchange"})

    if (isAddEventListenerWithHashchange) {
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: ONHASHCHANGE_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          onhashchange: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { AssignmentExpression: handleAssignment, CallExpression: handleCallExpression, OptionalCallExpression: handleCallExpression };
};

export { onhashchangeAnalyzerBuilder };
