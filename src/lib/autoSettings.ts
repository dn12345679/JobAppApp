export type AiProvider = "openai" | "gemini" | "anthropic";

export interface AutoSettings {
  aiProvider: AiProvider;
  aiModel: string;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  aiKey?: string; // legacy migration support
}

export interface ProviderConfig {
  id: AiProvider;
  name: string;
  defaultModel: string;
  keyPlaceholder: string;
  models: { id: string; name: string }[];
}

export const PROVIDER_OPTIONS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-proj-...",
    models: [
      { id: "gpt-4o-mini", name: "gpt-4o-mini (fast & cheap)" },
      { id: "gpt-4o", name: "gpt-4o" },
      { id: "gpt-4.5-preview", name: "gpt-4.5-preview" },
      { id: "o3-mini", name: "o3-mini" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-3.6-flash",
    keyPlaceholder: "AIzaSy...",
    models: [
      { id: "gemini-3.6-flash", name: "gemini-3.6-flash (recommended)" },
      { id: "gemini-2.5-flash", name: "gemini-2.5-flash" },
      { id: "gemini-2.5-pro", name: "gemini-2.5-pro" },
      { id: "gemini-1.5-flash", name: "gemini-1.5-flash" },
      { id: "gemini-1.5-pro", name: "gemini-1.5-pro" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-3-5-haiku-latest",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-3-5-haiku-latest", name: "claude-3-5-haiku (fast)" },
      { id: "claude-3-7-sonnet-latest", name: "claude-3-7-sonnet" },
      { id: "claude-3-5-sonnet-latest", name: "claude-3-5-sonnet" },
    ],
  },
];

const STORAGE_KEY = "jobtracker:auto_settings";

export const DEFAULT_AUTO_SETTINGS: AutoSettings = {
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
  openaiKey: "",
  geminiKey: "",
  anthropicKey: "",
};

export function getActiveApiKey(settings: AutoSettings, provider?: AiProvider): string {
  const p = provider ?? settings.aiProvider;
  switch (p) {
    case "openai":
      return settings.openaiKey || settings.aiKey || "";
    case "gemini":
      return settings.geminiKey || "";
    case "anthropic":
      return settings.anthropicKey || "";
    default:
      return "";
  }
}

export function loadAutoSettings(): AutoSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUTO_SETTINGS };
    const parsed = JSON.parse(raw);
    const aiProvider: AiProvider = parsed.aiProvider ?? DEFAULT_AUTO_SETTINGS.aiProvider;
    let aiModel: string = parsed.aiModel ?? DEFAULT_AUTO_SETTINGS.aiModel;

    // Auto-migrate deprecated models like gemini-2.0-flash
    if (aiProvider === "gemini" && (aiModel === "gemini-2.0-flash" || !aiModel)) {
      aiModel = "gemini-3.6-flash";
    }

    return {
      aiProvider,
      aiModel,
      openaiKey: parsed.openaiKey ?? parsed.aiKey ?? "",
      geminiKey: parsed.geminiKey ?? "",
      anthropicKey: parsed.anthropicKey ?? "",
    };
  } catch {
    return { ...DEFAULT_AUTO_SETTINGS };
  }
}

export function saveAutoSettings(settings: Partial<AutoSettings>): AutoSettings {
  const current = loadAutoSettings();
  const next: AutoSettings = { ...current, ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("Failed to save auto settings to localStorage", err);
  }
  return next;
}

