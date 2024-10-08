import * as vscode from "vscode"
import { ExtensionMessage } from "../../../shared/ExtensionMessage"
import { WebviewMessage } from "../../../shared/WebviewMessage"
import { getNonce, getUri } from "../../../utils"
import { ClaudeDevProvider } from "../ClaudeDevProvider"
import { amplitudeTracker } from "../../../utils/amplitude"

export class WebviewManager {
	private static readonly latestAnnouncementId = "aug-28-2024"

	constructor(private provider: ClaudeDevProvider) {}

	setupWebview(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.provider.getContext().extensionUri],
		}
		webviewView.webview.html = this.getHtmlContent(webviewView.webview)

		this.setWebviewMessageListener(webviewView.webview)

		if ("onDidChangeViewState" in webviewView) {
			webviewView.onDidChangeViewState(
				() => {
					if (webviewView.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.provider["disposables"]
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			webviewView.onDidChangeVisibility(
				() => {
					if (webviewView.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.provider["disposables"]
			)
		}
	}

	async postMessageToWebview(message: ExtensionMessage) {
		await this.provider["view"]?.webview.postMessage(message)
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	private async getStateToPostToWebview() {
		const state = await this.provider.getStateManager().getState()
		const koduDevState = this.provider.getKoduDev()?.getStateManager().state
		const extensionName = this.provider.getContext().extension?.packageJSON?.name
		return {
			...state,
			version: this.provider.getContext().extension?.packageJSON?.version ?? "",
			themeName: vscode.workspace.getConfiguration("workbench").get<string>("colorTheme"),
			uriScheme: vscode.env.uriScheme,
			extensionName,
			claudeMessages: koduDevState?.claudeMessages ?? [],
			taskHistory: (state.taskHistory || []).filter((item) => item.ts && item.task).sort((a, b) => b.ts - a.ts),
			shouldShowAnnouncement: state.lastShownAnnouncementId !== WebviewManager.latestAnnouncementId,
		}
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const localPort = "5173"
		const localServerUrl = `localhost:${localPort}`
		let scriptUri
		const isProd = this.provider.getContext().extensionMode === vscode.ExtensionMode.Production
		if (isProd) {
			scriptUri = getUri(webview, this.provider.getContext().extensionUri, [
				"webview-ui-vite",
				"build",
				"assets",
				"index.js",
			])
		} else {
			scriptUri = `http://${localServerUrl}/src/index.tsx`
		}
		const stylesUri = getUri(webview, this.provider.getContext().extensionUri, [
			"webview-ui-vite",
			"build",
			"assets",
			"index.css",
		])

		const codiconsUri = getUri(webview, this.provider.getContext().extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const nonce = getNonce()

		// const csp = [
		// 	`default-src 'none';`,
		// 	`script-src 'unsafe-eval' https://* ${
		// 		isProd ? `'nonce-${nonce}'` : `http://${localServerUrl} http://0.0.0.0:${localPort} 'unsafe-inline'`
		// 	}`,
		// 	`style-src ${webview.cspSource} 'self' 'unsafe-inline' https://*`,
		// 	`font-src ${webview.cspSource}`,
		// 	`img-src ${webview.cspSource} data:`,
		// 	`connect-src https://* ${
		// 		isProd
		// 			? ``
		// 			: `ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`
		// 	}`,
		// 	`frame-src https://*`,
		// 	`child-src https://*`,
		// 	`window-open https://*`,
		// ]
		const csp = [
			`default-src 'none';`,
			`script-src 'unsafe-eval' https://* ${
				isProd ? `'nonce-${nonce}'` : `http://${localServerUrl} http://0.0.0.0:${localPort} 'unsafe-inline'`
			}`,
			`style-src ${webview.cspSource} 'self' 'unsafe-inline' https://*`,
			`font-src ${webview.cspSource}`,
			`img-src ${webview.cspSource} data:`,
			`connect-src https://* ${
				isProd
					? ``
					: `ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`
			}`,
		]

		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
	        <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
            <title>Claude Dev</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            ${
				isProd
					? ""
					: `
                <script type="module">
                  import RefreshRuntime from "http://${localServerUrl}/@react-refresh"
                  RefreshRuntime.injectIntoGlobalHook(window)
                  window.$RefreshReg$ = () => {}
                  window.$RefreshSig$ = () => (type) => type
                  window.__vite_plugin_react_preamble_installed__ = true
                </script>
                `
			}
            <script type="module" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case "freeTrial":
						await this.provider.getApiManager().initFreeTrialUser(message.fp)
						break
					case "openExternalLink":
						vscode.env.openExternal(vscode.Uri.parse(message.url))
						break
					case "amplitude":
						if (message.event_type === "Add Credits") {
							amplitudeTracker.addCreditsClick()
						}
						if (message.event_type === "Referral Program") {
							amplitudeTracker.referralProgramClick()
						}
						if (message.event_type === "Auth Start") {
							amplitudeTracker.authStart()
						}

						break

					case "cancelCurrentRequest":
						await this.provider.getKoduDev()?.taskExecutor.cancelCurrentRequest()
						await this.postStateToWebview()
						break
					case "abortAutomode":
						await this.provider.getTaskManager().clearTask()
						await this.postStateToWebview()
						break
					case "webviewDidLaunch":
						await this.postStateToWebview()
						break
					case "newTask":
						await this.provider.getTaskManager().handleNewTask(message.text, message.images)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							await this.provider.getApiManager().updateApiConfiguration(message.apiConfiguration)
							await this.postStateToWebview()
						}
						break
					case "maxRequestsPerTask":
						await this.provider
							.getStateManager()
							.setMaxRequestsPerTask(message.text ? Number(message.text) : undefined)
						await this.postStateToWebview()
						break
					case "customInstructions":
						await this.provider.getStateManager().setCustomInstructions(message.text || undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowReadOnly":
						await this.provider.getStateManager().setAlwaysAllowReadOnly(message.bool ?? false)
						await this.postStateToWebview()
						break
					case "alwaysAllowWriteOnly":
						await this.provider.getStateManager().setAlwaysAllowWriteOnly(message.bool ?? false)
						await this.postStateToWebview()
						break
					case "askResponse":
						await this.provider
							.getTaskManager()
							.handleAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						await this.provider.getTaskManager().clearTask()
						await this.postStateToWebview()
						break
					case "didCloseAnnouncement":
						await this.provider
							.getGlobalStateManager()
							.updateGlobalState("lastShownAnnouncementId", WebviewManager.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await this.provider.getTaskManager().selectImages()
						await this.postMessageToWebview({
							type: "selectedImages",
							images: images.map((img) => img.data),
						})
						break
					case "exportCurrentTask":
						await this.provider.getTaskManager().exportCurrentTask()
						break
					case "showTaskWithId":
						await this.provider.getTaskManager().showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						await this.provider.getTaskManager().deleteTaskWithId(message.text!)
						break
					case "setCreativeMode":
						await this.provider
							.getStateManager()
							.setCreativeMode(message.text as "creative" | "normal" | "deterministic")
						await this.postStateToWebview()
						break
					case "exportTaskWithId":
						await this.provider.getTaskManager().exportTaskWithId(message.text!)
						break
					case "didClickKoduSignOut":
						await this.provider.getApiManager().signOutKodu()
						await this.postStateToWebview()
						break
					case "fetchKoduCredits":
						await this.provider.getApiManager().fetchKoduCredits()
						await this.postMessageToWebview({
							type: "action",
							action: "koduCreditsFetched",
							state: await this.getStateToPostToWebview(),
						})
						break
					case "didDismissKoduPromo":
						await this.provider.getGlobalStateManager().updateGlobalState("shouldShowKoduPromo", false)
						await this.postStateToWebview()
						break
					case "resetState":
						await this.provider.getGlobalStateManager().resetState()
						await this.postStateToWebview()
						break
				}
			},
			null,
			this.provider["disposables"]
		)
	}
}
