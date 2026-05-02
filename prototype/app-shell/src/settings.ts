export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderInfo {
  name: string;
  label: string;
  installCommand: string;
  loginCommand: string;
  defaultModel: string;
  supportedModels: ProviderModel[];
}

export interface AppSettings {
  provider: string;
  models: Record<string, string>;
}

export interface ProviderStatus {
  installed: boolean;
  loggedIn: boolean;
  statusText: string | null;
  warnings: string[];
  installPath: string | null;
  version: string | null;
}

export function parseProviderStatus(stdout: string): ProviderStatus | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1));
    return {
      installed: Boolean(parsed?.installed?.installed),
      loggedIn: Boolean(parsed?.auth?.loggedIn),
      statusText: parsed?.auth?.statusText ?? null,
      warnings: Array.isArray(parsed?.auth?.warnings) ? parsed.auth.warnings : [],
      installPath: parsed?.installed?.path ?? null,
      version: parsed?.installed?.version ?? null,
    };
  } catch (_error) {
    return null;
  }
}
