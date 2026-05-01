interface ExtensionAPISettings {
  get: (key: string) => string | undefined;
  getAll: () => Record<string, string | number | boolean> | undefined;
  set: (key: string, value: string | number | boolean) => void;
}

interface RoamSupermemoAPI {
  extensionAPI: {
    settings: ExtensionAPISettings;
  };
}

declare global {
  interface Window {
    roamAlphaAPI: any;
    roamSupermemo: RoamSupermemoAPI;
  }
}

export {};
