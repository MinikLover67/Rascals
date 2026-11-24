// QR SVG generation. Desktop delegates to Rust (qr_svg command — one less
// JS dependency doing pixel work, decode-verified by scripts/qr-check);
// the plain-browser build keeps the qrcode JS lib. Both outputs are white
// modules on transparent with a 1-module margin.
export async function qrSvg(text: string): Promise<string> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('qr_svg', { text })
    } catch {
      // Command failed? Never break pairing over a QR — fall through to JS.
    }
  }
  const { default: QRCode } = await import('qrcode')
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    width: 160,
    color: { dark: '#ffffff', light: '#00000000' },
  })
}
