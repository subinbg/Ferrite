import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { createInterface } from 'readline'

export interface SidecarInfo {
  port: number
  token: string
  process: ChildProcess
}

function getBinaryPath(): string {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : ''
    return join(process.resourcesPath, `ferrite${ext}`)
  }
  // Dev mode: use cargo build output
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(__dirname, '..', '..', '..', 'target', 'debug', `ferrite${ext}`)
}

export function startSidecar(dataDir: string): Promise<SidecarInfo> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()
    console.log(`Starting Ferrite sidecar: ${binaryPath}`)

    const args = ['--dev', '--data-dir', dataDir]

    const child = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let port: number | null = null
    let token: string | null = null

    const rl = createInterface({ input: child.stdout! })

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Sidecar startup timed out after 10s'))
    }, 10_000)

    rl.on('line', (line: string) => {
      console.log(`[ferrite] ${line}`)

      if (line.startsWith('FERRITE_PORT=')) {
        port = parseInt(line.split('=')[1], 10)
      } else if (line.startsWith('FERRITE_TOKEN=')) {
        token = line.split('=')[1]
      } else if (line.startsWith('FERRITE_READY')) {
        clearTimeout(timeout)
        if (port && token) {
          resolve({ port, token, process: child })
        } else {
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
      reject(new Error(`Failed to start sidecar: ${err.message}`))
    })

    child.on('exit', (code: number | null) => {
      clearTimeout(timeout)
      if (code !== null && code !== 0) {
        reject(new Error(`Sidecar exited with code ${code}`))
      }
    })
  })
}

export function stopSidecar(info: SidecarInfo): void {
  if (!info.process || info.process.killed) return

  try {
    // SIGTERM for graceful shutdown — lets Rust close DB pools
    info.process.kill('SIGTERM')
  } catch {
    return // Already dead
  }

  // Force kill after 3 seconds if still alive
  const forceKillTimer = setTimeout(() => {
    try {
      if (info.process && !info.process.killed) {
        info.process.kill('SIGKILL')
      }
    } catch {
      // Already dead
    }
  }, 3_000)

  info.process.on('exit', () => clearTimeout(forceKillTimer))
}
