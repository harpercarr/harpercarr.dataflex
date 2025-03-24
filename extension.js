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
    
    // Scan workspace root for .sws files
    const files = await fs.readdir(workspaceRoot);
    const swsFile = files.find(file => file.toLowerCase().endsWith('.sws'));
    if (!swsFile) {
        console.log('No .sws file found in workspace root');
        return {};
    }

    // Read the "main" .sws file
    const swsConfig = await readSwsFile(workspaceRoot, swsFile); 
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
async function readSwsFile(workspaceRoot, swsFile) {
    if (!workspaceRoot) {
        console.log('No workspace root provided; cannot read .sws file');
        return {};
    }

    try {
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
    
    // Read paths from the workspace .sws file first...
    if (workspaceRoot && swsConfig) {
        const wsPaths = swsConfig['workspacepaths'] || {};
        const libraries = swsConfig['libraries'] || {};

        // Read config.ws for main .sws additional paths
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
                        if (!value || value === ".") return [];
                        const pathArray = value.split(';').map(p => p.trim());
                        return pathArray.map(p => path.resolve(workspaceRoot, p)).filter(p => p);
                    });

                console.log('Paths from main config.ws:', pathLines);
                externalPaths.push(...pathLines);
            } catch (err) {
                console.log(`No config.ws found or error reading it: ${err.message}`);
            }
        }

        // Add Library paths (process linked .sws files)
        for (const lib of Object.values(libraries)) {
            // lib is the full path, e.g., "..\DataFlex Reports\DataFlex Reports Demo.sws"
            const libConfig = await readSwsFile(workspaceRoot, lib); // Read library .sws
            const libWsPaths = libConfig['workspacepaths'] || {};

            // Optionally read config.ws from library .sws
            if (libWsPaths['configfile']) {
                const configWsPath = path.resolve(path.dirname(path.join(workspaceRoot,lib)), libWsPaths['configfile']);
                try {
                    const content = await fs.readFile(configWsPath, 'utf8');
                    const lines = content.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

                    const pathLines = lines
                        .filter(line => /path/i.test(line))
                        .flatMap(line => {
                            const [key, value] = line.split('=');
                            if (!value || value === ".") return [];
                            const pathArray = value.split(';').map(p => p.trim());
                            return pathArray.map(p => path.resolve(path.dirname(configWsPath), p)).filter(p => p);
                        });

                    console.log(`Paths from library config.ws (${configWsPath}):`, pathLines);
                    externalPaths.push(...pathLines);
                } catch (err) {
                    console.log(`No config.ws found for library at ${configWsPath}: ${err.message}`);
                }
            }
        }

        
    } else {
        console.log('No workspace folder open or no swsConfig; skipping .sws processing');
    }

    // Finally add the paths from the package.json configuration... will probably be to the DataFlex installation
    const configPaths = vscode.workspace.getConfiguration('vdf').get('externalLibraryPaths', []);
    console.log('Paths from package.json (vdf.externalLibraryPaths):', configPaths);
    externalPaths.push(...configPaths);

    console.log('Combined externalPaths before deduplication:', externalPaths);
    return [...new Set(externalPaths)];
}


function deactivate() {}

module.exports = {
    activate,
    deactivate
};