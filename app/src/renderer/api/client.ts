const getConfig = () => {
  // Standalone browser mode: API is on the same origin.
  return { serverUrl: window.location.origin, token: '' }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (window.ferrite?.requestJson) {
    const body = typeof options.body === 'string'
      ? JSON.parse(options.body)
      : options.body

    return window.ferrite.requestJson<T>({
      path,
      method: options.method,
      body,
      headers: options.headers as Record<string, string> | undefined
    })
  }

  const { serverUrl, token } = getConfig()
  const url = `${serverUrl}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {})
  }

  const response = await fetch(url, {
    ...options,
    headers
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' })
}
