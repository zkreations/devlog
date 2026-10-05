export class MockKV {
  private store: Map<string, string>

  constructor(initialData: Record<string, string> = {}) {
    this.store = new Map(Object.entries(initialData))
  }

  async get(key: string, type: 'text' | 'json' = 'text'): Promise<any> {
    if (!this.store.has(key)) {
      return null
    }
    const val = this.store.get(key)!
    if (type === 'json') {
      try {
        return JSON.parse(val)
      }
      catch {
        return null
      }
    }
    return val
  }

  async put(key: string, value: string | unknown): Promise<void> {
    this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}
