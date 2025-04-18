# DataFlex Language Support for Visual Studio Code

[![Version](https://img.shields.io/vscode-marketplace/v/harpercarr.dataflex)](https://marketplace.visualstudio.com/items?itemName=harpercarr.dataflex)
[![Installs](https://img.shields.io/vscode-marketplace/i/harpercarr.dataflex)](https://marketplace.visualstudio.com/items?itemName=harpercarr.dataflex)
[![Rating](https://img.shields.io/vscode-marketplace/r/harpercarr.dataflex)](https://marketplace.visualstudio.com/items?itemName=harpercarr.dataflex)
This extension provides language support for DataFlex within Visual Studio Code, enhancing your development experience with features like symbol navigation, definition lookup, and compilation.
Originally this was an extension of the Dataflex-Colorize extension by Alisson Rodrigues. https://marketplace.visualstudio.com/items?itemName=alissoncfr.vdf  His colorization is what is being used, but I did add colorization rules for some missing things... mostly webapp related.

## Features

* **Symbol Provider:** Browse and navigate symbols (classes, functions, variables, etc.) within your DataFlex code. Use the "Go to Symbol in Workspace" (`Ctrl+Shift+O` or `Cmd+Shift+O`) and "Go to Symbol in File" (`Ctrl+Shift+` or `Cmd+Shift+`) commands.  Symbol Provider also allows the "Outline" view to work similar to "Code Explorer" in the Dataflex Stufio
* **Definition Provider:** Quickly jump to the definition of a symbol (e.g., a function or variable) by using "Go to Definition" (`F12`).
* **Project Management:**
    * Detects `.sws` (DataFlex Workspace) files in your workspace.
    * Allows you to select the current DataFlex project from the `.sws` file using the status bar item or the `DataFlex: Set Current Project` command.
* **Workspace Switching:** The `DataFlex: Open Workspace` command allows you to open a new VS Code workspace based on the location of a selected `.sws` file, re-initializing the DataFlex environment for that workspace.
* **Compilation (Windows Only):** Provides a `DataFlex: Compile` command to compile the currently set project's main source file (`.src`). Output and error messages are displayed in a dedicated "DataFlex Compiler" output channel.  Does what ammounts to a "runprogram wait dfcomp.exe ..."  If there are any errors during the compile they will be displayed in an 
* **External Library Paths:** Automatically detects and includes external library paths defined in your `.sws` file and linked library `.sws` files, as well as paths configured in your VS Code settings.
* **Automatic Install Path Detection (Windows Only):** Attempts to automatically locate your DataFlex installation path from the Windows registry based on the version specified in your `.sws` file.  I'm not really sure what will happen if you open a DF25 workspace without having DF25 installed.
* **Manual Install Path Configuration:** If the automatic detection fails or you need to specify a different path, you can use the `DataFlex: Set Install Path` command.

## How to Use

1.  **Open your DataFlex project folder in Visual Studio Code.** Ensure your project root contains your `.sws` file.
2.  **The extension should automatically detect the `.sws` file.** If no `.sws` file is found in the workspace root, an error message will be displayed.
3.  **Open a Workspace `.sws` file.**
* Use the command `DataFlex: Open Workspace` to select a different `.sws` file. This will open the folder containing the selected `.sws` file as the new VS Code workspace and re-initialize the DataFlex environment.
4.  **Select the Current Project:**
    * A status bar item on the left will display the current DataFlex project (initially empty). Click on this item to open a quick pick list of projects defined in your `.sws` file and select the one you want to work with.
    * Alternatively, use the command `DataFlex: Set Current Project` (`Ctrl+Shift+P` or `Cmd+Shift+P` to open the command palette).
5.  **Navigate Code:**
    * Use "Go to Symbol in Workspace" (`Ctrl+Shift+O` or `Cmd+Shift+O`) to find symbols across your project.
    * Use "Go to Symbol in File" (`Ctrl+Shift+` or `Cmd+Shift+`) to find symbols within the current file.
    * Use "Go to Definition" (`F12`) to jump to the definition of a selected symbol.
6.  **Compile (Windows):**
    * Ensure a current project is selected.
    * Use the command `DataFlex: Compile` to compile the main `.src` file of the current project. The compiler output will appear in the "DataFlex Compiler" output channel (`View > Output`, then select "DataFlex Compiler" from the dropdown).
7.  **Set Install Path (if needed):**
    * If the extension doesn't automatically find your DataFlex installation or prompts you, use the command `DataFlex: Set Install Path` to manually specify the root directory of your DataFlex installation.

## Extension Settings

This extension contributes the following settings to VS Code (accessible via `File > Preferences > Settings` or `Code > Preferences > Settings`):

* `dataflex.externalLibraryPaths`: An array of additional paths to include when resolving definitions, beyond those found in the `.sws` files. Use absolute paths or paths relative to your workspace root.  If needed you can add additional paths for the definition provider to search.

## Requirements

* For compilation features, a DataFlex development environment installed on a Windows operating system.

## Known Issues

* Precompiling coming soon...

## Contributing

* https://github.com/harpercarr/harpercarr.dataflex

## Release Notes

### [0.1.0] - 2025-04-18

* Initial public release

### [Previous Releases]

## License

Released under the GPL 3.0 License

---

**Developed by Harper Carr**

