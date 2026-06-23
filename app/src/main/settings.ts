import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export interface DesktopSettings {
  dataDir?: string
  mcpEnabled: boolean
}

const DEFAULT_SETTINGS: DesktopSettings = {
  mcpEnabled: true
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'desktop-settings.json')
}

export async function loadSettings(): Promise<DesktopSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>
    return {
      dataDir: typeof parsed.dataDir === 'string' ? parsed.dataDir : undefined,
      mcpEnabled: typeof parsed.mcpEnabled === 'boolean'
        ? parsed.mcpEnabled
        : DEFAULT_SETTINGS.mcpEnabled
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: DesktopSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}
