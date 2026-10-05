export function decodeXmlEntities(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&#39;/g, '\'')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(Number(dec))
      }
      catch {
        return _
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(Number.parseInt(hex, 16))
      }
      catch {
        return _
      }
    })
    .trim()
}

export function getTagValue(xml: string | null | undefined, tagName: string): string | null {
  if (!xml || typeof xml !== 'string') {
    return null
  }
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(xml)
  return match ? decodeXmlEntities(match[1]) : null
}

export function getAttrValue(tagStr: string | null | undefined, attrName: string): string | null {
  if (!tagStr || typeof tagStr !== 'string') {
    return null
  }
  const match = new RegExp(`${attrName}=["']([^"']+)["']`, 'i').exec(tagStr)
  return match ? match[1] : null
}
