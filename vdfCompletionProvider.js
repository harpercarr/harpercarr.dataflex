// vdfCompletionProvider.js
const vscode = require('vscode');

class VdfCompletionProvider {
    provideCompletionItems(document, position, token, context) {
        console.log('Completion triggered at line', position.line);
        return [new vscode.CompletionItem('Test', vscode.CompletionItemKind.Text)];
    }
    /*
    provideCompletionItems(document, position, token, context) {
        if (token.isCancellationRequested) {
            console.log('Completion canceled at line', position.line);
            return [];
        }

        console.log('Completion triggered at line', position.line, 'text:', document.lineAt(position.line).text);
        const linePrefix = document.lineAt(position.line).text.substr(0, position.character).trimLeft();

        if (/^If\b/i.test(linePrefix)) {
            console.log('Matched "If"');
            const completionItem = new vscode.CompletionItem('If', vscode.CompletionItemKind.Snippet);
            completionItem.insertText = new vscode.SnippetString('If (${1:condition}) Begin\n\t${2}\nEnd');
            completionItem.detail = 'Inserts an If-Begin-End block';
            
            return [completionItem];
        }
        return [];
    }
    */
}

module.exports = VdfCompletionProvider;