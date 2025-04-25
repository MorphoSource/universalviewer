import {
  BaseConfig,
  CenterPanelContent,
  CenterPanelOptions,
  DownloadDialogueContent,
  DownloadDialogueOptions,
  ModuleConfig,
  SettingsDialogueContent,
  SettingsDialogueOptions,
  ShareDialogueContent,
  ShareDialogueOptions,
} from "@/content-handlers/iiif/BaseConfig";

type AlephR3FCenterPanelOptions = CenterPanelOptions & {
  /** Determines if annotation and control toolbars are enabled */
  toolbarsEnabled: boolean;
};

type AlephR3FCenterPanelContent = CenterPanelContent & {};

type AlephR3FCenterPanel = {
  options: AlephR3FCenterPanelOptions;
  content: AlephR3FCenterPanelContent;
};

type AlephR3FDownloadDialogueOptions = DownloadDialogueOptions & {};

type AlephR3FDownloadDialogueContent = DownloadDialogueContent & {};

type AlephR3FDownloadDialogue = ModuleConfig & {
  options: AlephR3FDownloadDialogueOptions;
  content: AlephR3FDownloadDialogueContent;
};

type AlephR3FShareDialogueOptions = ShareDialogueOptions & {};

type AlephR3FShareDialogueContent = ShareDialogueContent & {};

type AlephR3FShareDialogue = ModuleConfig & {
  options: AlephR3FShareDialogueOptions;
  content: AlephR3FShareDialogueContent;
};

type AlephR3FSettingsDialogueOptions = SettingsDialogueOptions & {};

type AlephR3FSettingsDialogueContent = SettingsDialogueContent & {};

type AlephR3FSettingsDialogue = ModuleConfig & {
  options: AlephR3FSettingsDialogueOptions;
  content: AlephR3FSettingsDialogueContent;
};

type Modules = {
  centerPanel: AlephR3FCenterPanel;
  downloadDialogue: AlephR3FDownloadDialogue;
  shareDialogue: AlephR3FShareDialogue;
  settingsDialogue: AlephR3FSettingsDialogue;
};

export type Config = BaseConfig & {
  modules: Modules;
};
