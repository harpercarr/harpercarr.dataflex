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

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
 
    // Example: Read the .sws file
    const swsConfig = await readSwsFile(workspaceRoot); 
    console.log('SWS file contents:', swsConfig);
    
    // Get external paths
    const externalPaths = await getExternalPaths(workspaceRoot, swsConfig);
    
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

// Find and read the single .sws file in the workspace root
async function readSwsFile(workspaceRoot) {
    if (!workspaceRoot) {
        console.log('No workspace root provided; cannot read .sws file');
        return {};
    }

    try {
        // Scan workspace root for .sws files
        const files = await fs.readdir(workspaceRoot);
        const swsFile = files.find(file => file.toLowerCase().endsWith('.sws'));
        if (!swsFile) {
            console.log('No .sws file found in workspace root');
            return {};
        }

        const swsPath = path.join(workspaceRoot, swsFile);
        const content = await fs.readFile(swsPath, 'utf8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith(';')); // Ignore comments

        const config = {};
        let currentSection = null;

        for (const line of lines) {
            const sectionMatch = line.match(/^\[(.+)\]$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1].toLowerCase();
                config[currentSection] = {};
                continue;
            }

            if (currentSection) {
                const [key, value] = line.split('=').map(part => part.trim());
                if (key && value) {
                    config[currentSection][key.toLowerCase()] = value;
                }
            }
        }

        console.log(`Loaded .sws file: ${swsPath}`);
        return config;
    } catch (err) {
        console.log(`Error reading .sws file: ${err.message}`);
        return {};
    }
}

// Updated getExternalPaths to use .sws file
async function getExternalPaths(workspaceRoot, swsConfig) {
    let externalPaths = [];

    // From package.json
    const configPaths = vscode.workspace.getConfiguration('vdf').get('externalLibraryPaths', []);
    console.log('Paths from package.json (vdf.externalLibraryPaths):', configPaths);
    externalPaths.push(...configPaths);

    // From .sws file
    if (workspaceRoot) {
        //const swsConfig = await readSwsFile(workspaceRoot);
        const wsPaths = swsConfig['workspacepaths'] || {};
        const libraries = swsConfig['libraries'] || {};

        // Add Library paths (resolved relative to workspace root)
        Object.values(libraries).forEach(lib => {
            externalPaths.push(path.resolve(workspaceRoot, path.dirname(lib)));
        });

        // Optionally read config.ws for additional paths
        if (wsPaths['configfile']) {
            const configWsPath = path.resolve(workspaceRoot, wsPaths['configfile']);
            try {
                const content = await fs.readFile(configWsPath, 'utf8');
                const lines = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);

                const pathLines = lines
                    .filter(line => /path/i.test(line))
                    .flatMap(line => {
                        const [key, value] = line.split('=');
                        if (!value) return [];
                        const pathArray = value.split(';').map(p => p.trim());
                        return pathArray.map(p => path.resolve(workspaceRoot, p)).filter(p => p);
                    });

                console.log('Paths from config.ws:', pathLines);
                externalPaths.push(...pathLines);
            } catch (err) {
                console.log(`No config.ws found or error reading it: ${err.message}`);
            }
        }
    } else {
        console.log('No workspace folder open; skipping .sws processing');
    }

    console.log('Combined externalPaths before deduplication:', externalPaths);
    return [...new Set(externalPaths)];
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};