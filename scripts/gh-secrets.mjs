// Stores the Tauri signing key + password as GitHub Actions secrets
// (sealed with the repo's public key, exactly like `gh secret set` does).
// Run once. Key material never leaves this machine except sealed. ASCII only.
import { readFileSync } from 'node:fs'
import sodium from 'libsodium-wrappers'
import path from 'node:path'

const TOKEN = process.argv[2] || ''
if (!TOKEN) {
  console.log('usage: node scripts/gh-secrets.mjs <github-token>')
  process.exit(2)
}
await sodium.ready
const home = process.env.USERPROFILE || process.env.HOME || ''
const privKey = readFileSync(path.join(home, '.tauri/rascals.key'), 'utf8').trim()
const privPw = readFileSync(path.join(home, '.tauri/rascals-signer-pw.txt'), 'utf8').trim()
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' }

const pubRes = await fetch('https://api.github.com/repos/MinikLover67/Rascals/actions/secrets/public-key', { headers: H })
const pubJ = await pubRes.json()
if (!pubJ.key) throw new Error('no repo public key: ' + JSON.stringify(pubJ).slice(0, 200))
// GitHub serves STANDARD base64; libsodium 0.8 defaults to URLSAFE_NO_PADDING,
// so the variant must be explicit here (our own stored keys round-trip on defaults).
const repoPub = sodium.from_base64(pubJ.key, sodium.base64_variants.ORIGINAL)

async function putSecret(name, value) {
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), repoPub)
  // GitHub expects STANDARD base64 here (libsodium 0.8 defaults to URLSAFE).
  const encoded = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL)
  const r = await fetch(`https://api.github.com/repos/MinikLover67/Rascals/actions/secrets/${name}`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: encoded, key_id: pubJ.key_id }),
  })
  console.log(name + ': HTTP ' + r.status)
  if (r.status !== 201 && r.status !== 204) throw new Error('failed ' + name + ': ' + (await r.text()).slice(0, 200))
}

await putSecret('TAURI_SIGNING_PRIVATE_KEY', privKey)
await putSecret('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', privPw)
console.log('secrets stored')
