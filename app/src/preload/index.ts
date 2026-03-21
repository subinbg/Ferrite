import { contextBridge } from 'electron'

function getArg(prefix: string): string | undefined {
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.split('=')[1]
}

const port = getArg('--ferrite-port')
const token = getArg('--ferrite-token')

const ferriteApi = {
  serverUrl: port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:3000',
  token: token || ''
}

contextBridge.exposeInMainWorld('ferrite', ferriteApi)
