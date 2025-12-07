// Transform import.meta.env to a mockable object for Jest
const ts = require('typescript');

module.exports = function (program) {
  return {
    before: [
      (context) => {
        return (sourceFile) => {
          function visit(node) {
            if (ts.isPropertyAccessExpression(node) && 
                ts.isMetaProperty(node.expression) && 
                node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
              // Transform import.meta.env to (globalThis as any).import?.meta?.env || {}
              const globalThisAccess = ts.createPropertyAccess(
                ts.createAsExpression(
                  ts.createIdentifier('globalThis'),
                  ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
                ),
                'import'
              );
              const metaAccess = ts.createPropertyAccess(
                ts.createOptionalChain(globalThisAccess),
                'meta'
              );
              const envAccess = ts.createPropertyAccess(
                ts.createOptionalChain(metaAccess),
                'env'
              );
              const fallback = ts.createObjectLiteral([], false);
              return ts.createBinary(
                envAccess,
                ts.SyntaxKind.BarBarToken,
                fallback
              );
            }
            return ts.visitEachChild(node, visit, context);
          }
          return ts.visitNode(sourceFile, visit);
        };
      }
    ]
  };
};

