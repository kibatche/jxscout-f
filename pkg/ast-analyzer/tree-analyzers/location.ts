import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const LOCATION_ANALYZER_NAME = "location";

// Common location properties and methods
const LOCATION_PROPERTIES = [
  "href",
  "protocol",
  "host",
  "hostname",
  "port",
  "pathname",
  "search",
  "hash",
  "origin",
];

const locationAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  const handleAssignment = (path: NodePath<t.AssignmentExpression>) => {
    const node = path.node;
    if (!node.loc || node.start == null || node.end == null) return;

    // On est obligé de faire cela afin de pouvoir accéder à ) node.left.object au cas où on a
    // whatever.location.href = truc.
    // href, dans ce cas, reste une propriété de left, mais par contre location dvient une propriété de l'objet "whatever"
    // Cela semble inutilement compliqué mais les check de type ts nous obligent à faire cela.
    const left = node.left
    if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
    const obj = left.object;
    const base =
      t.isIdentifier(obj, { name: "location" })
      || ((t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
        && ((t.isIdentifier(obj.property, { name: "location" }) && !obj.computed)
          || t.isStringLiteral(obj.property, { value: "location" })));

    const okProp =
      (t.isIdentifier(left.property) && !left.computed && LOCATION_PROPERTIES.includes(left.property.name))
      || (t.isStringLiteral(left.property) && LOCATION_PROPERTIES.includes(left.property.value));

    const isLocationAssignment = base && okProp;

    // Check for location assignments - only on the left side
    if (isLocationAssignment) {
      const locationPropertyName = t.isIdentifier(left.property) && !left.computed ? left.property.name
        : t.isStringLiteral(left.property) ? left.property.value : "dynamic"

      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: LOCATION_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          location: true,
          "location-assignment": true,
          [`property-${locationPropertyName}`]: true,
        },
      };

      matchesReturn.push(match);
      return; // Return early to prevent double detection
    }
  }

  const handleMemberExpression = (path: NodePath<t.MemberExpression | t.OptionalMemberExpression>) => {
    const node = path.node
    if (!node.loc || node.start == null || node.end == null) return;

    // On teste si le parent est une affectation et si le noeud courant est à gauche dudit parent retrouvé
    if (path.findParent(p => p.isAssignmentExpression() && p.node.left === path.node)) return;


    const obj = node.object;
    const base =
      t.isIdentifier(obj, { name: "location" })
      || ((t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
        && ((t.isIdentifier(obj.property, { name: "location" }) && !obj.computed)
          || t.isStringLiteral(obj.property, { value: "location" })));

    const okProp =
      (t.isIdentifier(node.property) && !node.computed && LOCATION_PROPERTIES.includes(node.property.name))
      || (t.isStringLiteral(node.property) && LOCATION_PROPERTIES.includes(node.property.value));

    const isLocationRead = base && okProp;

    if (isLocationRead) {
      const locationPropertyName = t.isIdentifier(node.property) && !node.computed ? node.property.name
        : t.isStringLiteral(node.property) ? node.property.value : "dynamic"

      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: LOCATION_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          location: true,
          "location-read": true,
          [`property-${locationPropertyName}`]: true,
        },
      };

      matchesReturn.push(match);
    }
  }
  return { AssignmentExpression: handleAssignment, MemberExpression: handleMemberExpression, OptionalMemberExpression: handleMemberExpression }
};

export { locationAnalyzerBuilder };
