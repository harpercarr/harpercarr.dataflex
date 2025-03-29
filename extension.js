// extension.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const WinReg = require('winreg');
const createSymbolProvider = require('./dataflexSymbolProvider');
const createDefinitionProvider = require('./dataflexDefinitionProvider');

async function activate(context) {
    // Initialize UI
    const ui = initializeUI(context);

    // Setup paths and config
    const { dataflexInstallPath, workspaceRoot, swsFile, swsConfig, projects } = await setupEnvironment(context);
    if (!workspaceRoot || !swsConfig) return; // Early exit handled in setupEnvironment

    const externalPaths = await getExternalPaths(workspaceRoot, swsConfig);
    if (dataflexInstallPath) externalPaths.push(path.join(dataflexInstallPath, 'Pkg'));

    // Register providers
    registerLanguageProviders(context, externalPaths);

    // Load and display current project
    await manageCurrentProject(context, ui.currentProjectStatusBar, projects);

    // Register commands
    registerCommands(context, ui.currentProjectStatusBar, workspaceRoot, swsFile, projects);
}

// UI Setup
function initializeUI(context) {
    const currentProjectStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    currentProjectStatusBar.tooltip = 'Click to select a DataFlex project';
    currentProjectStatusBar.command = 'dataflex.setCurrentProject';
    context.subscriptions.push(currentProjectStatusBar);
    return { currentProjectStatusBar };
}

// Environment Setup
async function setupEnvironment(context) {
    const hasRunBefore = context.globalState.get('hasRunBefore', false);
    context.globalState.update('dataflexInstallPath', null);

    const dataflexInstallPath = await getOrSetDataFlexInstallPath(context, hasRunBefore);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return {};
    }

    const files = await fs.readdir(workspaceRoot);
    const swsFile = files.find(file => file.toLowerCase().endsWith('.sws'));
    if (!swsFile) {
        vscode.window.showErrorMessage('No .sws file found in workspace root.');
        return { dataflexInstallPath, workspaceRoot };
    }

    const swsConfig = await readSwsFile(path.resolve(workspaceRoot, swsFile));
    const projects = Object.entries(swsConfig.projects || {}).map(([_, srcFile]) => ({
        name: path.basename(srcFile, '.src'),
        srcPath: path.join(workspaceRoot, 'AppSrc', srcFile)
    }));

    return { dataflexInstallPath, workspaceRoot, swsFile, swsConfig, projects };
}

// Language Providers
function registerLanguageProviders(context, externalPaths) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('dataflex');
    context.subscriptions.push(diagnosticCollection);

    const symbolProvider = createSymbolProvider(diagnosticCollection);
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('dataflex', symbolProvider)
    );

    //const swsConfig = readSwsFile(workspaceRoot, swsFile); // Already awaited in setup
    //let  externalPaths = await getExternalPaths(workspaceRoot, swsConfig);
    //if (dataflexInstallPath) externalPaths.then(paths => paths.push(path.join(dataflexInstallPath, 'Pkgs')));

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('dataflex', createDefinitionProvider(externalPaths))
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'dataflex') {
                symbolProvider.provideDocumentSymbols(event.document, new vscode.CancellationTokenSource().token);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'dataflex') {
                symbolProvider.provideDocumentSymbols(document, new vscode.CancellationTokenSource().token);
            }
        })
    );
}

// Current Project Management
async function manageCurrentProject(context, statusBar, projects) {
    let currentProject = context.globalState.get('currentProject');
    if (currentProject) {
        const project = projects.find(p => p.name === currentProject.name && p.srcPath === currentProject.srcPath);
        if (project && (await fileExists(project.srcPath))) {
            statusBar.text = `Project: ${project.name}`;
            statusBar.show();
        } else {
            context.globalState.update('currentProject', null);
            currentProject = null;
        }
    }
    return currentProject;
}

// Commands
function registerCommands(context, statusBar, workspaceRoot, swsFile, projects) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dataflex.setInstallPath', () => promptForInstallPath(context)),
        vscode.commands.registerCommand('dataflex.setCurrentProject', async () => {
            if (!projects.length) {
                vscode.window.showErrorMessage('No projects found in the workspace (.sws file).');
                return;
            }

            const quickPickItems = projects.map(project => ({
                label: project.name,
                description: project.srcPath,
            }));
            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select the current DataFlex project',
            });

            if (selected) {
                const currentProject = { name: selected.label, srcPath: selected.description };
                context.globalState.update('currentProject', currentProject);
                statusBar.text = `Project: ${currentProject.name}`;
                statusBar.show();
                vscode.window.showInformationMessage(`Set current project to: ${currentProject.name}`);
            }
        }),
        vscode.commands.registerCommand('dataflex.compile', async () => {
            const currentProject = context.globalState.get('currentProject');
            if (!currentProject) {
                vscode.window.showErrorMessage('No current project set. Please select a DataFlex project first.');
                return;
            }
            await compileFile(path.join(workspaceRoot, swsFile), currentProject.srcPath, context);
        })
    );
}

// Utility Functions
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
            dataflexInstallPath = await getDataFlexInstallPathFromRegistry();
            if (dataflexInstallPath) {
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
    const compilerPath = dataflexInstallPath ? path.join(dataflexInstallPath, 'Bin', 'DFComp.exe') : null;
    if (compilerPath && !(await fileExists(compilerPath))) {
        console.error('Compiler not found at:', compilerPath);
        dataflexInstallPath = await promptForInstallPath(context);
    }
    return dataflexInstallPath;
}

async function promptForInstallPath(context) {
    const folder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select DataFlex Install Folder',
        defaultUri: vscode.Uri.file('C:\\Program Files\\DataFlex 23.0')
    });
    if (folder?.length) {
        const selectedPath = folder[0].fsPath;
        context.globalState.update('dataflexInstallPath', selectedPath);
        context.globalState.update('hasRunBefore', true);
        return selectedPath;
    }
    return null;
}

async function compileFile(swsPath, srcPath, context) {
    const { exec } = require('child_process');
    const compilerPath = path.join(context.globalState.get('dataflexInstallPath') || '', 'Bin', 'DFComp.exe');
    if (!(await fileExists(compilerPath))) {
        vscode.window.showErrorMessage('Compiler not found. Set install path via "dataflex.setInstallPath".');
        return;
    }

    const outputChannel = vscode.window.createOutputChannel('DataFlex Compiler');
    outputChannel.show(true);

    const command = `"${compilerPath}" -x"${swsPath}" "${srcPath}"`; 
    outputChannel.appendLine(`Executing: ${command}`);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    exec(command, { cwd: workspaceRoot }, async (error, stdout, stderr) => {
        outputChannel.appendLine(stdout || 'No output from compiler.');
        if (error) {
            outputChannel.appendLine(`Error: ${error.message}`);
            const baseName = path.basename(srcPath, '.src');
            const errFile = path.join(workspaceRoot, 'AppSrc', `${baseName}.err`);
            if (await fileExists(errFile)) {
                const errors = await fs.readFile(errFile, 'utf8');
                outputChannel.appendLine('Compiler Errors:\n' + errors);
            }
            outputChannel.appendLine(stderr || 'No additional error info.');
            return;
        }
        outputChannel.appendLine('Compilation successful.');
        if (stderr) outputChannel.appendLine(stderr);
    });
}

function getDataFlexInstallPathFromRegistry() {
    return new Promise((resolve, reject) => {
        const regKey = new WinReg({
            hive: WinReg.HKLM,
            key: '\\SOFTWARE\\WOW6432Node\\Data Access Worldwide\\DataFlex\\19.1\\Defaults'
        });
        regKey.get('VDFRootDir', (err, item) => {
            if (err) return reject(err);
            resolve(item?.type === 'REG_SZ' ? item.value : null);
        });
    });
}

async function readSwsFile(swsFilePath) {
    try {
        const content = await fs.readFile(swsFilePath, 'utf8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && !line.startsWith(';'));

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
                if (key && value) config[currentSection][key.toLowerCase()] = value;
            }
        }
        return config;
    } catch (err) {
        console.log(`Error reading .sws file: ${err.message}`);
        return {};
    }
}

async function getExternalPaths(workspaceRoot, swsConfig) {
    const externalPaths = [];
    if (!workspaceRoot || !swsConfig) {
        console.log('No workspace or swsConfig; skipping .sws processing');
        return externalPaths;
    }

    const wsPaths = swsConfig['workspacepaths'] || {};
    const libraries = swsConfig['libraries'] || {};

    if (wsPaths['configfile']) {
        const configWsPath = path.resolve(workspaceRoot, wsPaths['configfile']);
        try {
            const content = await fs.readFile(configWsPath, 'utf8');
            const paths = content.split('\n')
                .map(line => line.trim())
                .filter(line => line && /path/i.test(line))
                .flatMap(line => line.split('=')[1]?.split(';').map(p => p.trim()).filter(p => p && p !== '.') || [])
                .map(p => path.resolve(workspaceRoot, p));
            for (const p of paths) {
                if (await fileExists(p)) {
                    externalPaths.push(p);
                }
            }
                
            //externalPaths.push(...paths);
        } catch (err) {
            console.log(`No config.ws found or error reading it: ${err.message}`);
        }
    }

    for (let lib of Object.values(libraries)) {
        const isRelative = lib.startsWith('.');
        
        if (isRelative) {
            // Handling relative paths to libraries by resolving them relative to the workspace root.
            lib = path.resolve(workspaceRoot, lib);
        } 
        
        if (path.resolve(path.dirname(lib)) != workspaceRoot) {
            externalPaths.push(await processLibrary(lib));
        }
    }

    const configPaths = vscode.workspace.getConfiguration('dataflex').get('externalLibraryPaths', []);
    if (configPaths.length && configPaths[0] !== '') externalPaths.push(...configPaths);

    return [...new Set(externalPaths)];
}

async function processLibrary(lib){
    const libConfig = await readSwsFile(lib);
    if (!libConfig) {
        return{};
    }
    
    let libraryPaths = [];

    const libWsPaths = libConfig['workspacepaths'] || {};
    const libPath = path.dirname(lib);
    if (libWsPaths['configfile']) {
        const configWsPath = path.resolve(path.dirname(lib), libWsPaths['configfile']);
        
        try {
            const content = await fs.readFile(configWsPath, 'utf8');
            const paths = content.split('\n')
                .map(line => line.trim())
                .filter(line => line && /path/i.test(line))
                .flatMap(line => line.split('=')[1]?.split(';').map(p => p.trim()).filter(p => p && p !== '.') || [])
                .map(p => path.resolve(libPath, p));
            for (const path of paths) {
                if (await fileExists(path)) {
                    libraryPaths.push(path);
                }
            }

        } catch (err) {
            console.log(`No configfile found for library "${lib}" at ${configWsPath}: ${err.message}`);
            
        }
    }

    return libraryPaths;
}
function deactivate() {}

module.exports = { activate, deactivate };