export interface FerriteApi {
  serverUrl: string
  token: string
}

declare global {
  interface Window {
    ferrite: FerriteApi
  }
}
