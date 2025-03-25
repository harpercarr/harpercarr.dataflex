// dataflexSymbolProvider.js
const vscode = require('vscode');

function createSymbolProvider(diagnosticCollection) {
    return {
        provideDocumentSymbols(document, token) {
            const symbols = [];
            const containerStack = [];
            const diagnostics = [];
            const lines = document.getText().split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (line.startsWith('//') || line.match(/^\s*\*/)) continue;

                // Match Use with extension
                const useMatch = line.match(/^\s*Use\s+(\w+\.\w+)/i);
                if (useMatch) {
                    const name = useMatch[1];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        '',
                        vscode.SymbolKind.File,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent ) {
                        parent.symbol.children.push(symbol);
                    } else {
                        symbols.push(symbol);
                    }
                    continue;
                }
                
                // Match Property
                const propertyMatch = line.match(/^\s*Property\s+(\w+)\s+(\w+)\s+(.+)$/i);
                if (propertyMatch) {
                    const type = propertyMatch[1];
                    const name = propertyMatch[2];
                    const value = propertyMatch[3];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        type,
                        vscode.SymbolKind.Property,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent ) {
                        parent.symbol.children.push(symbol);
                    } else {
                        symbols.push(symbol);
                    }
                    continue;
                }

                // Match Class
                const classMatch = line.match(/^\s*Class\s+(\w+)\s+is\s+a\s+\w+/i);
                if (classMatch) {
                    const name = classMatch[1];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        '',
                        vscode.SymbolKind.Class,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent && parent.type === 'Class') {
                        const parentType = containerStack[containerStack.length - 1].type;
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Class '${name}' cannot be nested inside a ${parentType}`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    } else {
                        symbols.push(symbol);
                        containerStack.push({ symbol, type: 'Class' });
                    }
                    continue;
                }

                // Match Object
                const objectMatch = line.match(/^\s*Object\s+(\w+)\s+is\s+a\s+\w+/i);
                if (objectMatch) {
                    const name = objectMatch[1];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        '',
                        vscode.SymbolKind.Object,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent && parent.type === 'Class') {
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Object '${name}' cannot be nested inside a Class`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    } else if (parent) {
                        parent.symbol.children.push(symbol);
                        containerStack.push({ symbol, type: 'Object' });
                    } else {
                        symbols.push(symbol);
                        containerStack.push({ symbol, type: 'Object' });
                    }
                    continue;
                }

                // Match Procedure
                const procedureMatch = line.match(/^\s*Procedure\s+(\w+)/i);
                if (procedureMatch) {
                    const name = procedureMatch[1];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        '',
                        vscode.SymbolKind.Method,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent && (parent.type === 'Function' || parent.type === 'Procedure')) {
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Procedure '${name}' cannot be declared inside a ${parent.type}`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    } else if (parent) {
                        parent.symbol.children.push(symbol);
                        containerStack.push({ symbol, type: 'Procedure' });
                    } else {
                        symbols.push(symbol);
                        containerStack.push({ symbol, type: 'Procedure' });
                    }
                    continue;
                }

                // Match Function
                //const functionMatch = line.match(/^\s*Function\s+(\w+)(\s+\w+\s+\w+)*\s+Returns\s+\w+$/i);
                const functionMatch = line.match(/^\s*Function\s+(\w+)(\s+\w+\s+\w+)*\s+returns\s+(\w+)$/i);
                if (functionMatch) {
                    const name = functionMatch[1];
                    const range = new vscode.Range(i, 0, i, line.length);
                    const returnType = functionMatch[3];
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        returnType,
                        vscode.SymbolKind.Function,
                        range,
                        range
                    );
                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent && (parent.type === 'Function' || parent.type === 'Procedure')) {
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Function '${name}' cannot be declared inside a ${parent.type}`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    } else if (parent) {
                        parent.symbol.children.push(symbol);
                        containerStack.push({ symbol, type: 'Function' });
                    } else {
                        symbols.push(symbol);
                        containerStack.push({ symbol, type: 'Function' });
                    }
                    continue;
                }

                // End of Class, Object, Procedure, or Function
                if (line.match(/^\s*End_(Class|Object|Procedure|Function)/i)) {
                    if (containerStack.length > 0) {
                        const closingSymbol = containerStack.pop().symbol;
                        closingSymbol.range = new vscode.Range(
                            closingSymbol.range.start,
                            new vscode.Position(i, line.length)
                        );
                    }
                    continue;
                }
            }

            // Update diagnostics for this document
            diagnosticCollection.set(document.uri, diagnostics);

            return symbols;
        }
    };
}

module.exports = createSymbolProvider;