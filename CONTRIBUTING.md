# Contributing to Rascals

Thanks for wanting to help! Rascals is in beta, so the highest-value
contributions right now are testing and bug reports.

## Reporting bugs

1. Open a GitHub issue with:
   - Your OS and the app version (Settings shows it).
   - What you did, what you expected, what happened.
   - For connection problems: whether it's LAN or across the internet, and
     whether you needed a TURN server.
2. If it's a security issue, read [SECURITY.md](SECURITY.md) first —
   executable proof beats descriptions.

## Dev setup

```bash
npm install
npm run dev        # browser preview (separate storage per browser)
npm run tauri dev  # desktop app (needs Rust + platform webview deps)
```

## Before you open a PR

```bash
npm run test   # vitest unit tests must pass
npm run lint   # oxlint must be clean
```

- Keep PRs focused: one fix or feature per PR.
- Match the existing TypeScript style; the lint config is the arbiter.
- Protocol/display logic should stay pure and unit-testable where possible.
- Don't touch release scripts or the signing workflow unless you've
  discussed it in an issue first.

## Roadmap

Check [ROADMAP.md](ROADMAP.md) before proposing big features — if it's on
the roadmap, say so in your issue; if it isn't, propose it anyway.
