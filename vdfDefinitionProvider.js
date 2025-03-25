// dataflexDefinitionProvider.js
const vscode = require('vscode');
const path = require('path');

function createDefinitionProvider(externalPaths) {
    return {
        provideDefinition(document, position, token) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) {
                console.log('No word found at cursor position');
                return null;
            }

            const word = document.getText(wordRange); // e.g., "foo" or "bar"
            const line = document.lineAt(position.line).text.trim();
            
            // Check if this is an Object declaration line (e.g., "Object foo is a bar")
            const objectMatch = line.match(/^\s*(?:Object|Class)\s+(\w+)\s+is\s+a\s+(\w+)/i);
            if (objectMatch) {
                const objectName = objectMatch[1]; // "foo"
                const superClass = objectMatch[2];  // "bar"

                // If clicking the object name (foo), skip because this is its definition
                if (word === objectName) {
                    console.log(`"${word}" is the object name in its declaration; skipping`);
                    return null;
                }

                // If clicking the superclass (bar), find its Class definition
                if (word === superClass) {
                    return findSuperClassDefinition(word, externalPaths);
                }
            }

            // For non-Object declaration lines (e.g., "Send foo"), or other declaration types
            // Skip if this is a declaration of the clicked word
            if (line.match(new RegExp(`^\\s*(Procedure|Function)\\s+${word}\\b`, 'i'))) {
                console.log(`"${word}" is a declaration; skipping`);
                return null;
            }

            // Search for the definition (Object, Class, Procedure, Function)
            return findDefinition(document, word, externalPaths);
        }
    };
}

async function findDefinition(document, word, externalPaths) {
    // Check open documents in the workspace first
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === 'vdf') {
            const definition = await searchDocumentForDefinition(doc, word);
            if (definition) {
                return definition;
            }
        }
    }

    // Check all external paths
    const fs = require('fs').promises;
    for (const externalPath of externalPaths) {
        try {
            const files = await fs.readdir(externalPath);
            for (const file of files) {
                if (file.endsWith('.df')) {
                    const filePath = path.join(externalPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        const objectMatch = line.match(/^\s*Object\s+(\w+)\s+is\s+a\s+(\w+)/i);
                        if (objectMatch && objectMatch[1] === word) {
                            return new vscode.Location(
                                vscode.Uri.file(filePath),
                                new vscode.Position(i, 0)
                            );
                        }
                        if (line.match(new RegExp(`^\\s*(Class|Procedure|Function)\\s+${word}\\b`, 'i'))) {
                            return new vscode.Location(
                                vscode.Uri.file(filePath),
                                new vscode.Position(i, 0)
                            );
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to read external path ${externalPath}: ${err}`);
            continue;
        }
    }
    //console.log(`No definition found for "${word}". Is it a built-in class?`);
    vscode.window.showInformationMessage(`No definition found for "${word}". Is it a built-in class?`);
    return null;
}

async function findSuperClassDefinition(word, externalPaths) {
    const fs = require('fs').promises;

    // Check all external paths
    for (const externalPath of externalPaths) {
        try {
            const files = await fs.readdir(externalPath);
            for (const file of files) {
                if (file.endsWith('.dd') || file.endsWith('.pkg') || file.endsWith('.vw') || file.endsWith('.bp')) {
                    const filePath = path.join(externalPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.match(new RegExp(`^\\s*Class\\s+${word}\\b`, 'i'))) {
                            return new vscode.Location(
                                vscode.Uri.file(filePath),
                                new vscode.Position(i, 0)
                            );
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to read external path ${externalPath}: ${err}`);
            continue;
        }
    }

    vscode.window.showInformationMessage(`No class definition found for "${word}". Is it a built-in class?`);
    return null;
}

async function searchDocumentForDefinition(doc, word) {
    const lines = doc.getText().split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const objectMatch = line.match(/^\s*Object\s+(\w+)\s+is\s+a\s+(\w+)/i);
        if (objectMatch && objectMatch[1] === word) {
            return new vscode.Location(
                doc.uri,
                new vscode.Position(i, 0)
            );
        }
        if (line.match(new RegExp(`^\\s*(Class|Procedure|Function)\\s+${word}\\b`, 'i'))) {
            return new vscode.Location(
                doc.uri,
                new vscode.Position(i, 0)
            );
        }
    }
    return null;
}

module.exports = createDefinitionProvider;