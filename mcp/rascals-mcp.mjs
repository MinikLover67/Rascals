#!/usr/bin/env node
// Rascals connection-debug MCP server (stdio, zero dependencies).
//
// Gives any MCP-capable AI assistant (Claude Desktop, Cursor, ...) tools to
// analyze a Rascals "Copy report" diagnostics snapshot and explain exactly
// why friend invites or presence are failing — with ordered fix steps.
//
// Register (see mcp/README.md), then in chat:
//   1. In Rascals: Friends panel → Connection doctor → "Copy report"
//   2. Paste the report to your AI and ask "why can't I connect?"
//   3. The AI calls analyze_rascals_connection with the report JSON.

import readline from 'node:readline'

const SERVER_INFO = { name: 'rascals-debug', version: '1.0.0' }

// --- knowledge base (mirrors src/lib/report.ts analyzeSnapshot) ------------

function analyze(report) {
  const findings = []
  if (!report || report.schema !== 'rascals-connection-report/1') {
    return {
      error:
        'This does not look like a Rascals connection report. Ask the user to open Rascals → Friends panel → Connection doctor → "Copy report", then paste the JSON here.',
    }
  }
  const t = report.transport || {}
  const relays = Array.isArray(t.relays) ? t.relays : []
  const up = relays.filter((r) => r.state === 'connected').length
  const peers = (t.lobbyPeers ?? 0) + (t.dmPeers ?? 0) + (t.groupPeers ?? 0)
  const wantsPeople =
    (report.friendCount ?? 0) > 0 ||
    (report.outgoingRequests ?? 0) + (report.incomingRequests ?? 0) > 0

  if (relays.length === 0) {
    findings.push({
      severity: 'info',
      title: 'Diagnostics not ready',
      detail: 'The P2P layer was still starting when the report was copied.',
      steps: ['Wait ~5 seconds in the app, then copy a fresh report'],
    })
  } else if (up === 0) {
    findings.push({
      severity: 'error',
      title: `No signaling relays reachable (0/${relays.length})`,
      detail:
        'Nothing can reach anyone: invites, friend requests and calls all ride ' +
        'the Nostr relays. This is the #1 cause of "added each other, nothing happened".',
      steps: [
        'Confirm the device has internet at all',
        'Corporate/school Wi-Fi, hotels, some VPNs block WebSocket relays — try a phone hotspot or home Wi-Fi',
        'After changing networks, re-open the Connection doctor and copy a fresh report',
      ],
    })
  } else if (up <= 1) {
    findings.push({
      severity: 'warn',
      title: `Weak signaling (${up}/${relays.length} relays)`,
      detail: 'Discovery works but is fragile — a single relay is a single point of failure.',
      steps: ['Continue if already connected', 'If invites stall, switch networks'],
    })
  } else {
    findings.push({
      severity: 'ok',
      title: `Signaling healthy (${up}/${relays.length} relays)`,
      detail: 'Invite codes and presence can flow.',
      steps: [],
    })
  }

  if (up >= 2 && peers === 0 && wantsPeople) {
    findings.push({
      severity: 'warn',
      title: 'Relays fine but no peer anywhere (NAT/firewall suspicion)',
      detail:
        'Signaling works but no device has connected. If the other person is ' +
        'definitely online now, the two networks cannot form a direct WebRTC ' +
        'connection (strict NAT, CGNAT, or Wi-Fi client isolation).',
      steps: [
        'Confirm the other person has Rascals open RIGHT NOW',
        'Same Wi-Fi? Router client isolation / guest mode blocks device-to-device traffic',
        'Cellular or CGNAT? Add a TURN server in Settings → Connection → Network relay',
        'Alternative: Tailscale on both devices',
      ],
    })
  }

  const s = report.settings || {}
  if (s.hideIp && !s.turnConfigured) {
    findings.push({
      severity: 'error',
      title: '"Hide my IP" enabled without a TURN server',
      detail:
        'Hide-IP forces relay-only WebRTC but there is no TURN server, so no peer ' +
        'can ever connect. This combination breaks ALL connections by design.',
      steps: [
        'Turn off "Hide my IP from peers" in Settings → Connection, OR',
        'Configure a TURN server with username/password in the same section',
      ],
    })
  }

  if (s.turnConfigured && s.hideIp && up >= 2 && peers === 0 && wantsPeople) {
    findings.push({
      severity: 'warn',
      title: 'Relay-only mode but nothing is relaying',
      detail: 'A wrong TURN URL/credential fails every connection while signaling stays green.',
      steps: [
        'Re-check TURN URL scheme (turn:/turns:), port, username, password',
        'Test the TURN server independently of Rascals',
        'As a last resort, clear the TURN fields to test direct connectivity',
      ],
    })
  }

  const pend = report.oldestOutgoingMs ?? 0
  if ((report.outgoingRequests ?? 0) > 0 && pend > 120000) {
    findings.push({
      severity: 'info',
      title: `Friend request pending ~${Math.round(pend / 60000)} min`,
      detail:
        'Requests retry every minute but only land while the other app is open and ' +
        'its signaling works. Stuck this long = their side is offline/blocked.',
      steps: [
        'Have the other person open Rascals and run THEIR Connection doctor',
        'Verify the invite code is complete and starts with rascal1:',
        'If accepted but still pending: both sides press "Repair connections"',
      ],
    })
  }

  if (peers > 0 && up >= 2) {
    findings.push({
      severity: 'ok',
      title: `Peers connected (${peers})`,
      detail: 'Transport is working right now — problems are likely elsewhere.',
      steps: [],
    })
  }

  const worst = findings.some((f) => f.severity === 'error')
    ? 'BLOCKED'
    : findings.some((f) => f.severity === 'warn')
      ? 'DEGRADED'
      : 'HEALTHY'

  return {
    verdict: worst,
    summary:
      worst === 'BLOCKED'
        ? 'Something is hard-broken. Follow the error-severity steps first.'
        : worst === 'DEGRADED'
          ? 'Partially working — likely environmental (network). See warnings.'
          : 'Transport looks healthy. If adding still fails, see the pending-request note.',
    findings,
    nextStep:
      'After each fix, re-copy a fresh report from the Connection doctor and re-run this analysis.',
  }
}

const GUIDE = `# Rascals connection failure modes (v1)

## How Rascals connects
1. INVITE: invite code "rascal1:<userId>:<name>" — no server, no accounts.
2. SIGNALING: both peers join Nostr relay rooms (11 curated public relays; only
   one relay in common is needed). Friend requests ("freq" knocks) ride these.
3. TRANSPORT: peers connect DIRECTLY over WebRTC DataChannels (E2EE, libsodium).
   Default ICE uses public STUN. If both sides are behind strict NAT / CGNAT
   and no TURN is configured, the direct connection can never form.

## Failure modes
- F1 Zero relays reachable (firewall/VPN/captive portal) → nothing arrives at all.
- F2 Relays fine, no peers → NAT/firewall blocks direct WebRTC, or other app closed.
- F3 hideIp ON without TURN → relay-only policy with nothing to relay through (always broken).
- F4 TURN misconfigured → relay-only fails while signaling looks healthy.
- F5 Other device offline / app closed → requests retry every minute, appear "stuck".
- F6 Mutual simultaneous add race → FIXED (2026-11): a verified mutual knock now
  completes the friendship instead of being recorded as a duplicate incoming request.
  Update both clients if either runs an older build.

## Repair actions in-app (Friends panel → Connection doctor)
- "Repair connections": rejoins lobby + all DM rooms, rebroadcasts presence.
- "Copy report": JSON diagnostics snapshot — paste it to your AI and run
  analyze_rascals_connection for a verdict.`

function parseInvite(code) {
  const m = /^rascal1:([^:]+):(.+)$/.exec((code || '').trim())
  if (!m) {
    return {
      valid: false,
      hint: 'Invite codes look like rascal1:<long-user-id>:<name> — check for truncation or stray spaces.',
    }
  }
  let name = m[2]
  try {
    name = decodeURIComponent(name)
  } catch {}
  return { valid: true, userIdLength: m[1].length, displayName: name }
}

// --- MCP stdio plumbing (JSON-RPC 2.0, newline-delimited) -------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

const TOOLS = [
  {
    name: 'analyze_rascals_connection',
    description:
      'Analyze a Rascals connection diagnostics report (copied from the app: Friends panel → Connection doctor → Copy report) and return a verdict with ordered fix steps.',
    inputSchema: {
      type: 'object',
      properties: {
        report: {
          type: 'string',
          description: 'The raw JSON report text the user pasted (schema rascals-connection-report/1).',
        },
      },
      required: ['report'],
    },
  },
  {
    name: 'rascals_connection_guide',
    description: 'Rascals P2P architecture + all known connection failure modes and repairs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'parse_rascals_invite',
    description: 'Validate a rascal1:… invite code and extract the display name.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The invite code text' } },
      required: ['code'],
    },
  },
]

function callTool(name, args) {
  try {
    if (name === 'analyze_rascals_connection') {
      let parsed
      try {
        parsed = JSON.parse(String(args?.report ?? '').trim())
      } catch {
        return { content: [{ type: 'text', text: 'The report is not valid JSON. Ask the user to re-copy it (Connection doctor → Copy report).' }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(analyze(parsed), null, 2) }] }
    }
    if (name === 'rascals_connection_guide') {
      return { content: [{ type: 'text', text: GUIDE }] }
    }
    if (name === 'parse_rascals_invite') {
      return { content: [{ type: 'text', text: JSON.stringify(parseInvite(args?.code), null, 2) }] }
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  } catch (e) {
    return { content: [{ type: 'text', text: `Tool error: ${e.message}` }], isError: true }
  }
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = msg
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    })
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  } else if (method === 'tools/call') {
    send({ jsonrpc: '2.0', id, result: callTool(params?.name, params?.arguments) })
  } else if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } })
  }
})
