// extension.js
const vscode = require('vscode');
const createSymbolProvider = require('./vdfSymbolProvider');
const createDefinitionProvider = require('./vdfDefinitionProvider');
const fs = require('fs').promises;
const path = require('path');
const WinReg = require('winreg');

async function activate(context) {
    // Status Bar for current project
    const currentProjectStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    currentProjectStatusBar.tooltip = 'Click to select a DataFlex project';
    currentProjectStatusBar.command = 'dataflex.setCurrentProject';
    context.subscriptions.push(currentProjectStatusBar);

    // Check if this is the first run
    const hasRunBefore = context.globalState.get('hasRunBefore', false);
    context.globalState.update('dataflexInstallPath', null); // Clear the path on each activation

    let dataflexInstallPath = await getOrSetDataFlexInstallPath(context, hasRunBefore);

    // Register command to update install path
    context.subscriptions.push(
        vscode.commands.registerCommand('dataflex.setInstallPath', () => promptForInstallPath(context))
    );

    const compilerPath = dataflexInstallPath ? path.join(dataflexInstallPath, 'Bin', 'DFComp.exe') : null;
    if (!compilerPath || !require('fs').existsSync(compilerPath)) {
        console.error('Compiler not found at:', compilerPath);
        // Prompt user or fallback
    }
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

    const projects = Object.entries(swsConfig.projects || {}).map(([key, srcFile]) => ({
        name: path.basename(srcFile, '.src'), // e.g., "Accounting"
        srcPath: path.join(workspaceRoot, 'AppSrc', srcFile) // e.g., "path/to/Accounting.src"
    }));

    // Load or set current project
    let currentProject = context.globalState.get('currentProject');
    if (currentProject) {
        const project = projects.find(p => p.name === currentProject.name && p.srcPath === currentProject.srcPath);
        if (project && (await fileExists(project.srcPath))) {
            currentProjectStatusBar.text = `Project: ${project.name}`;
            currentProjectStatusBar.show();
        } else {
            context.globalState.update('currentProject', null);
            currentProject = null;
        }
    }

    // Command to set current project
    context.subscriptions.push(
        vscode.commands.registerCommand('dataflex.setCurrentProject', async () => {
            if (!projects.length) {
                vscode.window.showErrorMessage('No projects found in the workspace (.sws file).');
                return;
            }

            const quickPickItems = projects.map(project => ({
                label: project.name, // e.g., "Program1"
                description: project.srcPath, // e.g., "AppSrc/Program1.src"
            }));
            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select the current DataFlex project',
            });

            if (selected) {
                currentProject = { name: selected.label, srcPath: selected.description };
                context.globalState.update('currentProject', currentProject);
                currentProjectStatusBar.text = `Project: ${currentProject.name}`;
                currentProjectStatusBar.show();
                vscode.window.showInformationMessage(`Set current project to: ${currentProject.name}`);
            }
        })
    );

    // Get external paths
    let externalPaths = await getExternalPaths(workspaceRoot, swsConfig);
    if (dataflexInstallPath) externalPaths.push(path.join(dataflexInstallPath, 'Pkgs'));

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

    context.subscriptions.push(
        vscode.commands.registerCommand('dataflex.compile', async () => {
            if (!currentProject) {
                vscode.window.showErrorMessage('No current project set. Please select a Dataflex project first.');
                return;
            }
            
            //await compileFile(path.join(workspaceRoot, swsFile), filePath, context);
            await compileFile(path.join(workspaceRoot, swsFile), currentProject.srcPath, context);
        })
    );

    
    
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}
async function getOrSetDataFlexInstallPath(context, hasRunBefore) {
    let dataflexInstallPath = context.globalState.get('dataflexInstallPath');

    if (process.platform === 'win32' && !dataflexInstallPath) {
        try {
            const pathFromRegistry = await getDataFlexInstallPathFromRegistry();
            if (pathFromRegistry) {
                dataflexInstallPath = pathFromRegistry;
                context.globalState.update('dataflexInstallPath', dataflexInstallPath);
                context.globalState.update('hasRunBefore', true);
                vscode.window.showInformationMessage(`Found DataFlex install path in registry: ${dataflexInstallPath}`);
            } else {
                dataflexInstallPath = await promptForInstallPath(context);
            }
        } catch (err) {
            console.error('Registry read error:', err);
            dataflexInstallPath = await promptForInstallPath(context);
        }
    } else if (!hasRunBefore) {
        dataflexInstallPath = await promptForInstallPath(context);
    }

    return dataflexInstallPath;
}

async function compileFile(swsFile, filePath, context) {
    const { exec } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;
    const compilerPath = path.join(context.globalState.get('dataflexInstallPath'), 'Bin', 'DFComp.exe');
    const outputChannel = vscode.window.createOutputChannel('DataFlex Compiler');
    outputChannel.show(true);

    const baseName = path.basename(filePath, '.src');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const errFile = path.join(workspaceRoot, 'AppSrc', `${baseName}.err`);

    const dfCompParams = `"${compilerPath}" -x"${swsFile}" "${filePath}"`;// Note, there can't be a space between the -x and the path to the .sws file.
    
    exec(dfCompParams, { cwd: workspaceRoot }, async (error, stdout, stderr) => {
        outputChannel.appendLine(stdout || 'No output from compiler.');
        if (error) {
            outputChannel.appendLine(`Error: ${error.message}`);
            if (await fileExists(errFile)) {
                const errors = await fs.readFile(errFile, 'utf8');
                outputChannel.appendLine('Compiler Errors:\n' + errors);
            }
            return;
        }
        outputChannel.appendLine('Compilation successful.');
    });
}

// Function to read DataFlex install path from registry
function getDataFlexInstallPathFromRegistry() {
    return new Promise((resolve, reject) => {
        const regKey = new WinReg({
            hive: WinReg.HKLM, // HKEY_LOCAL_MACHINE
            key: '\\SOFTWARE\\WOW6432Node\\Data Access Worldwide\\DataFlex\\19.1\\Defaults' // Specific path for 19.1
        });

        regKey.get('VDFRootDir', (err, item) => {
            if (err) {
                reject(err);
                return;
            }
            if (item && item.type === 'REG_SZ') {
                resolve(item.value); // Return the value of VDFRootDir
            } else {
                resolve(null); // Value not found or not a string
            }
        });
    });
}

// Parse the .sws file to extract configuration.  This will be called for the Main .sws file and any library .sws files.
// The .sws file format is a simple key=value format, with sections denoted by [section_name].
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
    if (Array.isArray(configPaths) && configPaths.length > 0 && configPaths[0] !== '') {
        externalPaths.push(...configPaths);
    }

    return [...new Set(externalPaths)];
}


function deactivate() {}

module.exports = {
    activate,
    deactivate
};