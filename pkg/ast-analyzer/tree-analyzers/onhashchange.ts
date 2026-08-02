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

    //A REFAIRE
    // const left = node.left
    // if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
    // const isOnhashchangeAssignment = (
    //   t.isIdentifier(left.object)
    //   && ((t.isIdentifier(left.property, { name: "onhashchange" }) && !left.computed) || t.isStringLiteral(left.property, { value: "onhashchange" })))
    //   ||
    //   ((t.isMemberExpression(left.object) || t.isOptionalMemberExpression(left.object))
    //     && (t.isIdentifier(left.object.property, { name: "onhashchange" }) || t.isStringLiteral(left.object.property, { value: "onhashchange" }))
    //     && (t.isIdentifier(left.property) || t.isStringLiteral(left.property)))

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
    
    //A REFAIRE
    // const isAddEventListenerWithHashchange = (
    //   t.isIdentifier(callee.object)
    //   && ((t.isIdentifier(callee.property, { name: "addEventListener" }) && !callee.computed) || t.isStringLiteral(callee.property, { value: "addEventListener" })))
    //   ||
    //   ((t.isMemberExpression(callee.object) || t.isOptionalMemberExpression(callee.object))
    //     && (t.isIdentifier(callee.object.property, { name: "addEventListener" }) || t.isStringLiteral(callee.object.property, { value: "addEventListener" }))
    //     && (t.isIdentifier(callee.property, { name: "onhashchange" }) || t.isStringLiteral(callee.property, { value: "onhashchange" })))


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
