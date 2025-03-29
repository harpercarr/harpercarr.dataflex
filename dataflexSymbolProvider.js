// dataflexSymbolProvider.js
const vscode = require('vscode');

// Flatten the text into logical lines, combining lines ending with a semicolon
// into a single line, and skipping standalone comment lines
function flattenText(lines) {
    const logicalLines = []; // Array of { text, startLine, endLine }
    let i = 0;

    while (i < lines.length) {
        let line = lines[i].trim();

        // Skip standalone comment lines
        if (line.startsWith('//') || line.match(/^\s*\*/)) {
            i++;
            continue;
        }

        let currentText = '';
        let startLine = i;
        let endLine = i;

        // Process the current declaration
        do {
            // Split line into code and comment parts
            let codePart = line;
            const commentIndex = line.indexOf('//');
            if (commentIndex !== -1) {
                codePart = line.substring(0, commentIndex).trim();
            }

            // Check for semicolon at the end of the code part
            let hasContinuation = codePart.endsWith(';');
            if (hasContinuation) {
                codePart = codePart.slice(0, -1).trim(); // Remove semicolon
            }

            // Add code part to current declaration
            if (codePart) {
                currentText += (currentText ? ' ' : '') + codePart;
            }

            if (hasContinuation) {
                i++;
                // Skip any comment lines between continuations
                while (i < lines.length && (lines[i].trim().startsWith('//') || lines[i].trim().match(/^\s*\*/))) {
                    i++;
                }
                if (i < lines.length) {
                    line = lines[i].trim();
                    endLine = i;
                } else {
                    break; // Reached end of file with an incomplete continuation
                }
            } else {
                break; // No continuation, end of this declaration
            }
        } while (true);

        if (currentText) {
            logicalLines.push({ text: currentText, startLine, endLine });
        }
        i++;
    }

    return logicalLines;
}

function createSymbolProvider(diagnosticCollection) {
    return {
        provideDocumentSymbols(document, token) {
            const symbols = [];
            const containerStack = [];
            const diagnostics = [];
            const lines = document.getText().split('\n');
            const logicalLines = flattenText(lines);
            
            for (let { text, startLine, endLine } of logicalLines) {
                const range = new vscode.Range(startLine, 0, endLine, lines[endLine].length);
                /*
                // Match Struct
                const structMatch = text.match(/^\s*Struct\s+(\w+)/i);
                if (structMatch) {
                    const name = structMatch[1];
                    const structRange = range; // Range of just the Struct line
                    let endLine = startLine;
                    const structChildren = [];
                    let insideStruct = false; // Track when we're inside the struct definition

                    // Find current line’s index
                    const currentIndex = logicalLines.findIndex(line => line.text === text && line.startLine === startLine);
                    if (currentIndex === -1) continue; // Shouldn’t happen, but safety check

                    // Look ahead for members and End_Struct
                    for (let i = currentIndex; i < logicalLines.length; i++) {
                        const nextLine = logicalLines[i];
                        const nextText = nextLine.text.trim();
                        endLine = nextLine.endLine;

                        if (i === currentIndex) {
                            insideStruct = true; // Start of struct
                            continue; // Skip the Struct line itself
                        }

                        if (nextText.match(/^\s*End_Struct/i)) {
                            break; // End of struct
                        }

                        if (insideStruct) {
                            // Match struct members (e.g., "Integer iValue", "String sName")
                            const memberMatch = nextText.match(/^\s*(\w+(?:\[\])?)\s+(\w+)/i);
                            if (memberMatch && !nextText.match(/^\s*Use\s+\w+/i)) { // Exclude Use statements
                                const memberType = memberMatch[1];
                                const memberName = memberMatch[2];
                                const memberRange = new vscode.Range(nextLine.startLine, 0, nextLine.endLine, nextLine.text.length);

                                const memberSymbol = new vscode.DocumentSymbol(
                                    memberName,
                                    memberType,
                                    vscode.SymbolKind.Field,
                                    memberRange,
                                    memberRange
                                );
                                structChildren.push(memberSymbol);
                            }
                        }
                    }

                    const fullStructRange = new vscode.Range(startLine, 0, endLine, logicalLines[endLine].text.length);
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        'struct',
                        vscode.SymbolKind.Struct,
                        fullStructRange,
                        structRange
                    );
                    symbol.children = structChildren;

                    const parent = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
                    if (parent) {
                        parent.symbol.children.push(symbol);
                        containerStack.push({ symbol, type: 'Struct' });
                    } else {
                        symbols.push(symbol);
                        containerStack.push({ symbol, type: 'Struct' });
                    }
                    continue;
                }
                    */
                   
                // Match Use with extension
                const useMatch = text.match(/^\s*Use\s+(\w+\.\w+)/i);
                if (useMatch) {
                    const name = useMatch[1];
                    //const range = new vscode.Range(i, 0, i, line.length);
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
                const propertyMatch = text.match(/^\s*Property\s+(\w+)\s+(\w+)\s+(.+)$/i);
                if (propertyMatch) {
                    const type = propertyMatch[1];
                    const name = propertyMatch[2];
                    const value = propertyMatch[3];
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
                const classMatch = text.match(/^\s*Class\s+(\w+)\s+is\s+a\s+(\w+)/i);
                if (classMatch) {
                    const name = classMatch[1];
                    const superClass= classMatch[2];
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        superClass,
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
                const objectMatch = text.match(/^\s*Object\s+(\w+)\s+is\s+a\s+(\w+)/i);
                if (objectMatch) {
                    const name = objectMatch[1];
                    const superClass= objectMatch[2];
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        superClass,
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
                const procedureMatch = text.match(/^\s*Procedure\s+(\w+)(?:\s+\w+(?:\[\])?(?:\s+ByRef)?\s+\w+)*$/i);
                if (procedureMatch) {
                    const name = procedureMatch[1];
                    
                    const paramMatch = text.match(/^\s*Procedure\s+\w+\s+((?:\w+(?:\[\])?(?:\s+ByRef)?\s+\w+\s*)*?)$/i);
                                                 
                    const symbol = new vscode.DocumentSymbol(
                        name,
                        '',
                        vscode.SymbolKind.Method,
                        range,
                        range
                    );

                    let procParams = [];
                    if (paramMatch && paramMatch[1]) {
                        const paramString = paramMatch[1].trim();
                        // Match each parameter with explicit groups for type, ByRef, and name
                        const paramPairs = paramString.matchAll(/(\w+(?:\[\])?)(?:\s+(ByRef))?\s+(\w+)/gi);
                        procParams = Array.from(paramPairs, match => ({
                            type: match[1],           // Group 1: type (e.g., "integer")
                            byRef: !!match[2],        // Group 2: "ByRef" if present, else undefined
                            name: match[3]            // Group 3: name (e.g., "iParam")
                        }));

                        const paramSymbols = procParams.map(param => {
                            return new vscode.DocumentSymbol(
                                param.name,
                                param.byRef ? param.type + ' <byref>' : param.type,
                                vscode.SymbolKind.Variable,
                                range,
                                range
                            );
                        });
                        symbol.children.push(...paramSymbols);
                    }
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
                const functionMatch = text.match(/^\s*Function\s+(\w+)(?:\s+\w+(?:\[\])?(?:\s+ByRef)?\s+\w+)*\s+returns\s+(\w+)/i);
                if (functionMatch) {
                    const name = functionMatch[1];
                    const returnType = functionMatch[2];

                    // Extract all parameters as a single string
                    const paramMatch = text.match(/^\s*Function\s+\w+\s+((?:\w+(?:\[\])?(?:\s+ByRef)?\s+\w+\s*)*?)(?:returns\s+\w+)/i);
                    let funcParams = [];
                    if (paramMatch && paramMatch[1]) {
                        const paramString = paramMatch[1].trim();
                        const paramPairs = paramString.matchAll(/(\w+(?:\[\])?)(?:\s+(ByRef))?\s+(\w+)/gi);
                        funcParams = Array.from(paramPairs, match => ({
                            type: match[1],           // Group 1: type (e.g., "integer")
                            byRef: !!match[2],        // Group 2: "ByRef" if present, else undefined
                            name: match[3]            // Group 3: name (e.g., "iParam")
                        }));
                    }

                    const symbol = new vscode.DocumentSymbol(
                        name,
                        returnType,
                        vscode.SymbolKind.Function,
                        range,
                        range
                    );

                    // Add parameter symbols as children
                    if (funcParams.length > 0) {
                        const paramSymbols = funcParams.map(param => {

                            return new vscode.DocumentSymbol(
                                param.name,
                                param.byRef ?  param.type + ' <byref>' : param.type,
                                vscode.SymbolKind.Variable,
                                range, // TODO: Ideally, use a more precise range for each param
                                range
                            );
                        });
                        symbol.children.push(...paramSymbols);
                    }

                    // Rest of the logic (parent checks, container stack, diagnostics)
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
                if (text.match(/^\s*End_(Class|Object|Procedure|Function|Struct)/i)) {
                    if (containerStack.length > 0) {
                        const closingSymbol = containerStack.pop().symbol;
                        closingSymbol.range = new vscode.Range(
                            closingSymbol.range.start, // Original start from when symbol was created
                            new vscode.Position(endLine, lines[endLine].length) // End at this line
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