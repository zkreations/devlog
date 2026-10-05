export async function verifyHmacSha256(
  secret: string | undefined | null,
  rawBody: string | undefined | null,
  signatureHeader: string | undefined | null,
): Promise<boolean> {
  if (!secret || !rawBody || !signatureHeader) {
    return false
  }

  const prefix = 'sha256='
  if (!signatureHeader.startsWith(prefix)) {
    return false
  }

  const expectedSignatureHex = signatureHeader.slice(prefix.length).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expectedSignatureHex)) {
    return false
  }

  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const bodyData = encoder.encode(rawBody)

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyData)
    const signatureArray = Array.from(new Uint8Array(signatureBuffer))
    const computedSignatureHex = signatureArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return timingSafeEqual(computedSignatureHex, expectedSignatureHex)
  }
  catch {
    return false
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
