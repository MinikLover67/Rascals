// Bumps the version across package.json, src-tauri/Cargo.toml and
// src-tauri/tauri.conf.json. Used by the release workflow (and by anyone
// cutting a release from a non-Windows machine).
// Usage: node scripts/bump-version.mjs 0.1.28
import { readFileSync, writeFileSync } from 'node:fs'

const v = process.argv[2] || ''
if (!/^\d+\.\d+\.\d+$/.test(v)) {
  console.error('usage: node scripts/bump-version.mjs <semver, e.g. 0.1.28>')
  process.exit(2)
}

for (const f of ['package.json', 'src-tauri/tauri.conf.json']) {
  const t = readFileSync(f, 'utf8')
  if (!/"version":\s*"\d+\.\d+\.\d+"/.test(t)) {
    console.error('could not find version field in ' + f)
    process.exit(1)
  }
  writeFileSync(f, t.replace(/"version":\s*"\d+\.\d+\.\d+"/, `"version": "${v}"`))
}

const cargoPath = 'src-tauri/Cargo.toml'
const cargo = readFileSync(cargoPath, 'utf8')
if (!/^version\s*=\s*"\d+\.\d+\.\d+"/m.test(cargo)) {
  console.error('could not find version field in src-tauri/Cargo.toml')
  process.exit(1)
}
writeFileSync(
  cargoPath,
  cargo.replace(/^version\s*=\s*"\d+\.\d+\.\d+"/m, `version = "${v}"`),
)

console.log('bumped all three manifests to ' + v)
