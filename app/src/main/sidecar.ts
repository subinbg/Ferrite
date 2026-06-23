import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { createInterface } from 'readline'

export const DEFAULT_MCP_PORT = 26260

export interface SidecarInfo {
  port: number
  token: string
  process: ChildProcess
}

export interface SidecarOptions {
  dataDir: string
  dev: boolean
  mcpEnabled: boolean
  mcpPort?: number
}

function getBinaryPath(): string {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : ''
    return join(process.resourcesPath, 'bin', `ferrite${ext}`)
  }
  // Dev mode: use cargo build output
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(__dirname, '..', '..', '..', 'target', 'debug', `ferrite${ext}`)
}

export function startSidecar(options: SidecarOptions): Promise<SidecarInfo> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()
    console.log(`Starting Ferrite sidecar: ${binaryPath}`)

    const args = ['--data-dir', options.dataDir]
    if (options.dev) {
      args.push('--dev')
    }
    if (options.mcpEnabled) {
      args.push('--mcp-port', String(options.mcpPort ?? DEFAULT_MCP_PORT))
    }

    const child = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let port: number | null = null
    let token: string | null = null
    let settled = false

    const rl = createInterface({ input: child.stdout! })

    const timeout = setTimeout(() => {
      settled = true
      child.kill()
      reject(new Error('Sidecar startup timed out after 10s'))
    }, 10_000)

    rl.on('line', (line: string) => {
      if (!line.startsWith('FERRITE_TOKEN=')) {
        console.log(`[ferrite] ${line}`)
      }

      if (line.startsWith('FERRITE_PORT=')) {
        port = parseInt(line.split('=')[1], 10)
      } else if (line.startsWith('FERRITE_TOKEN=')) {
        token = line.split('=')[1]
      } else if (line.startsWith('FERRITE_READY')) {
        clearTimeout(timeout)
        if (port && token) {
          settled = true
          resolve({ port, token, process: child })
        } else {
          settled = true
          child.kill()
          reject(new Error('Sidecar ready but missing port or token'))
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[ferrite:err] ${data.toString().trim()}`)
    })

    child.on('error', (err: Error) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        reject(new Error(`Failed to start sidecar: ${err.message}`))
      }
    })

    child.on('exit', (code: number | null) => {
      clearTimeout(timeout)
      if (!settled && code !== null && code !== 0) {
        settled = true
        reject(new Error(`Sidecar exited with code ${code}`))
      }
    })
  })
}

export function stopSidecar(info: SidecarInfo): Promise<void> {
  return new Promise((resolve) => {
    if (!info.process || info.process.killed) {
      resolve()
      return
    }

    const forceKillTimer = setTimeout(() => {
      try {
        if (info.process && !info.process.killed) {
          if (process.platform === 'win32') {
            info.process.kill()
          } else {
            info.process.kill('SIGKILL')
          }
        }
      } catch {
        // Already dead
      }
    }, 10_000)

    info.process.once('exit', () => {
      clearTimeout(forceKillTimer)
      resolve()
    })

    try {
      if (process.platform === 'win32') {
        info.process.kill()
      } else {
        info.process.kill('SIGTERM')
      }
    } catch {
      clearTimeout(forceKillTimer)
      resolve()
    }
  })
}
