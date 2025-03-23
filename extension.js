// extension.js
const vscode = require('vscode');
const createSymbolProvider = require('./vdfSymbolProvider');
const createDefinitionProvider = require('./vdfDefinitionProvider');
const fs = require('fs').promises;
const path = require('path');

async function activate(context) {
    
    // Create a diagnostic collection for DataFlex
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('vdf');
    context.subscriptions.push(diagnosticCollection);

    // Register symbol provider with diagnostics
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
        'vdf',
        createSymbolProvider(diagnosticCollection)
    );
    context.subscriptions.push(symbolProvider);


    // Get external paths
    const externalPaths = await getExternalPaths(context);
    
    // Definition provider
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        'vdf',
        createDefinitionProvider(externalPaths)
    );
    context.subscriptions.push(definitionProvider);

    // Update diagnostics on document change or open
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'vdf') {
                symbolProvider.provideDocumentSymbols(event.document, new vscode.CancellationTokenSource().token);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'vdf') {
                symbolProvider.provideDocumentSymbols(document, new vscode.CancellationTokenSource().token);
            }
        })
    );
}

async function getExternalPaths(workspaceRoot) {
    let externalPaths = [];

    // From package.json
    const configPaths = vscode.workspace.getConfiguration('vdf').get('externalLibraryPaths', []);
    externalPaths.push(...configPaths);

    // From config.ws
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configWsPath = path.join(workspaceRoot, '/Programs/config.ws');
        try {
            const content = await fs.readFile(configWsPath, 'utf8');
            const lines = content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const pathLines = lines
                .filter(line => /path/i.test(line)) // Test for 'path' in the line
                .flatMap(line => {
                    const [key, value] = line.split('=');
                    if (!value) return []; // No value, return empty array
                    const pathArray = value.split(';').map(p => p.trim());
                    return pathArray.map(p => path.resolve(workspaceRoot, p)).filter(p => p);
                });

            externalPaths.push(...pathLines);
        } catch (err) {
            console.log(`No config.ws found or error reading it: ${err.message}`);
        }
    } else {
        console.log('No workspace folder open; skipping config.ws');
    }

    return [...new Set(externalPaths)]; // Remove duplicates
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};