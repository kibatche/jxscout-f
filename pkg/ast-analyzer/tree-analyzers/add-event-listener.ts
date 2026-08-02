import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const ADD_EVENT_LISTENER_ANALYZER_NAME = "add-event-listener";

/**
 * @description
 * Teste si un noeud est un addEventListener.
 * Prend en charge:
 *   el.addEventListener
 *   el?.addEventListener
 *   addEventListener
 *   el?.["addEventListener"]("b", f)
 *   el["addEventListener"]("b", f)
 * @param args Les arguments de type AnalyzerParams (ast, source, filePath)
 * @param matchesReturn Le tableau de matches.
 * @returns 
 */
const addEventListenerAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handle = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;

    // Check if this is an addEventListener call
    const isAddEventListenerCall = (
      (t.isMemberExpression(node.callee) || t.isOptionalMemberExpression(node.callee)) 
      && ((t.isIdentifier(node.callee.property, { name: "addEventListener" }) && !node.callee.computed) || t.isStringLiteral(node.callee.property, { value: "addEventListener" }))
    )
      || t.isIdentifier(node.callee, { name: "addEventListener" })

    if (isAddEventListenerCall && node.arguments.length >= 2) {
      const eventType = t.isStringLiteral(node.arguments[0]) ? node.arguments[0].value : "dynamic"

      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: ADD_EVENT_LISTENER_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          "event-listener": true,
          [`event-type-${eventType}`]: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { CallExpression: handle, OptionalCallExpression: handle };
}

export { addEventListenerAnalyzerBuilder };
