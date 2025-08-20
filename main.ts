import {
	App,
	ItemView,
	WorkspaceLeaf,
	Plugin,
	Notice,
	TFile,
	debounce,
	MarkdownView,
	Editor,
} from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { CopilotApp } from "./src/components/CopilotApp";
import { ClaudeCopilotSettingTab } from "./src/components/SettingsTab";
import { ClaudeCopilotSettings } from "./src/types";
import { Settings, CopilotReactAPI } from "./src/types/copilotState";
import { insertCursorMarker } from "./src/utils/cursor";

const DEFAULT_SETTINGS: ClaudeCopilotSettings = {
	apiKey: "",
	model: "claude-3-5-haiku-latest",
	debounceDelay: 2000,
};

const VIEW_TYPE_CLAUDE_COPILOT = "claude-copilot-view";

class ClaudeCopilotView extends ItemView {
	plugin: ClaudeCopilotPlugin;
	private root: Root | null = null;
	private reactAPI: CopilotReactAPI | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ClaudeCopilotPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_CLAUDE_COPILOT;
	}

	getDisplayText() {
		return "Claude Copilot";
	}

	getIcon() {
		return "bot";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		this.root = createRoot(container);

		// Convert ClaudeCopilotSettings to our new Settings format
		const initialSettings: Settings = {
			apiKey: this.plugin.settings.apiKey,
			model: this.plugin.settings.model,
			debounceDelayMs: this.plugin.settings.debounceDelay,
		};

		this.root.render(
			React.createElement(CopilotApp, {
				initialSettings,
				onApiReady: (api: CopilotReactAPI) => {
					this.reactAPI = api;
					this.plugin.onCopilotReady(api);
				},
				app: this.plugin.app,
			}),
		);
	}

	// Simple proxy methods that delegate to React
	onEditorContentChanged(content: string, cursorPosition: number) {
		this.reactAPI?.onEditorContentChanged(content, cursorPosition);
	}

	updateSettings(settings: Partial<Settings>) {
		this.reactAPI?.updateSettings(settings);
	}

	async onClose() {
		this.reactAPI?.cancelPendingQueries();
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.reactAPI = null;
	}
}

export default class ClaudeCopilotPlugin extends Plugin {
	settings: ClaudeCopilotSettings;
	copilotView: ClaudeCopilotView;
	private reactAPI: CopilotReactAPI | null = null;

	async onload() {
		console.log("Claude Copilot: Starting plugin load...");
		try {
			await this.loadSettings();
			console.log("Claude Copilot: Settings loaded");

			this.registerView(VIEW_TYPE_CLAUDE_COPILOT, (leaf) => {
				this.copilotView = new ClaudeCopilotView(leaf, this);
				return this.copilotView;
			});

			this.addRibbonIcon("bot", "Claude Copilot", () => {
				this.activateView();
			});

			this.addCommand({
				id: "open-claude-copilot",
				name: "Open Claude Copilot",
				callback: () => {
					this.activateView();
				},
			});

			this.addSettingTab(
				new ClaudeCopilotSettingTab(this.app, this, (model: string) => {
					this.onModelChanged(model);
				}),
			);

			this.registerEvent(
				this.app.workspace.on(
					"editor-change",
					(editor: Editor, info: MarkdownView) => {
						this.handleDocumentChange(editor, info);
					},
				),
			);

			this.registerEvent(
				this.app.workspace.on("active-leaf-change", () => {
					const view =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						this.handleDocumentChange(view.editor, view);
					}
				}),
			);

			this.app.workspace.onLayoutReady(() => {
				setTimeout(() => {
					this.activateView();
				}, 100);
			});
			console.log("Claude Copilot: Plugin loaded successfully");
		} catch (error) {
			console.error("Claude Copilot: Error during plugin load:", error);
			throw error;
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE_COPILOT);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_CLAUDE_COPILOT,
				active: true,
			});
			workspace.revealLeaf(leaf);
		}
	}

	onCopilotReady(api: CopilotReactAPI) {
		this.reactAPI = api;
	}

	handleDocumentChange(editor: Editor, _view: MarkdownView) {
		const content = editor.getValue();
		const cursor = editor.getCursor();
		const cursorPos = editor.posToOffset(cursor);

		// Delegate to React
		this.copilotView?.onEditorContentChanged(content, cursorPos);
	}

	onModelChanged(model: string) {
		console.log("Model changed to:", model);
		this.reactAPI?.updateSettings({ model });
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLAUDE_COPILOT);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Sync settings to React
		this.reactAPI?.updateSettings({
			apiKey: this.settings.apiKey,
			model: this.settings.model,
			debounceDelayMs: this.settings.debounceDelay,
		});
	}
}
