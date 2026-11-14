// Connection doctor: one-tap diagnosis + repair, right where invites live.
// Answers "why didn't my friend add work?" without digging through Settings,
// and hands you a copy-paste report for an AI (see mcp/README.md).

import { useCallback, useEffect, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, ClipboardCopy, RefreshCw, Wrench } from 'lucide-react'
import type { Finding } from '../lib/report'
import { analyzeSnapshot, connectionReport } from '../lib/report'
import { useApp } from '../store/app'

const SEV_STYLE: Record<Finding['severity'], { dot: string; text: string }> = {
  ok: { dot: 'bg-rascal-green', text: 'text-rascal-green' },
  info: { dot: 'bg-rascal-amber', text: 'text-rascal-amber' },
  warn: { dot: 'bg-rascal-amber', text: 'text-rascal-amber' },
  error: { dot: 'bg-rascal-red', text: 'text-rascal-red' },
}

export default function ConnectionDoctor() {
  const [open, setOpen] = useState(false)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [transport, setTransport] = useState<ReturnType<typeof connectionReport> | null>(null)
  const [copied, setCopied] = useState(false)
  const [repairMsg, setRepairMsg] = useState<string | null>(null)
  const [repairing, setRepairing] = useState(false)

  const refresh = useCallback(() => {
    void import('../lib/session').then(({ diagnostics }) => {
      try {
        const d = diagnostics()
        const s = useApp.getState()
        const outReq = s.requests.filter((r) => r.direction === 'out')
        const snap = {
          relays: d?.relays ?? [],
          lobbyPeers: d?.lobbyPeers ?? 0,
          dmRooms: d?.dmRooms ?? 0,
          dmPeers: d?.dmPeers ?? 0,
          groupRooms: d?.groupRooms ?? 0,
          groupPeers: d?.groupPeers ?? 0,
          serverRooms: d?.serverRooms ?? 0,
        }
        setFindings(
          analyzeSnapshot(snap, {
            friendCount: s.friends.length,
            outgoingRequests: outReq.length,
            incomingRequests: s.requests.filter((r) => r.direction === 'in').length,
            turnConfigured: !!s.settings.turnUrl.trim(),
            hideIp: s.settings.hideIp,
            oldestOutgoingMs: outReq.length
              ? Math.max(...outReq.map((r) => Date.now() - r.ts))
              : null,
          }),
        )
        setTransport(connectionReport())
      } catch {
        setFindings(null)
      }
    })
  }, [])

  useEffect(() => {
    if (!open) return
    refresh()
    const t = setInterval(refresh, 10000)
    return () => clearInterval(t)
  }, [open, refresh])

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(transport, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  async function repair() {
    if (repairing) return
    setRepairing(true)
    setRepairMsg(null)
    try {
      const { resetConnection } = await import('../lib/session')
      setRepairMsg(await resetConnection())
      refresh()
    } catch {
      setRepairMsg('Repair hit a snag — try again.')
    } finally {
      setRepairing(false)
    }
  }

  const worst = findings?.reduce<Finding['severity'] | null>((acc, f) => {
    const rank = { ok: 0, info: 1, warn: 2, error: 3 }
    if (!acc || rank[f.severity] > rank[acc]) return f.severity
    return acc
  }, null)

  return (
    <div className="mt-2 rounded-lg border border-rascal-line bg-rascal-bg">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="doctor-toggle"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold text-rascal-dim hover:text-rascal-text"
        title="Diagnose why invites or friends aren't connecting"
      >
        <Activity className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">Connection doctor</span>
        {worst && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${SEV_STYLE[worst].dot}`} />
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-rascal-line p-2" data-testid="doctor-panel">
          {!findings && <p className="text-[11px] text-rascal-dim">Gathering connection info…</p>}
          {findings?.map((f, i) => (
            <div key={i} className="rounded-md border border-rascal-line p-2">
              <p className={`text-[11px] font-bold ${SEV_STYLE[f.severity].text}`}>
                {f.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-rascal-dim">{f.detail}</p>
              {f.steps.length > 0 && (
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-rascal-dim">
                  {f.steps.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ol>
              )}
            </div>
          ))}

          {transport && (
            <details className="text-[11px] text-rascal-dim">
              <summary className="cursor-pointer select-none">
                Raw transport state ({(transport.transport as { relays?: unknown[] })?.relays?.length ?? 0} relays tracked)
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(transport, null, 2)}
              </pre>
            </details>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={repair}
              disabled={repairing}
              data-testid="doctor-repair"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rascal-accent px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${repairing ? 'animate-spin' : ''}`} />
              {repairing ? 'Repairing…' : 'Repair connections'}
            </button>
            <button
              onClick={copyReport}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rascal-line px-2 py-1.5 text-xs font-semibold text-rascal-dim hover:border-rascal-accent hover:text-rascal-text"
              title="Copy a diagnostics report you can paste to an AI assistant (see mcp/README.md)"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy report'}
            </button>
          </div>
          {repairMsg && (
            <p className="flex items-start gap-1.5 text-[11px] text-rascal-dim">
              <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
              {repairMsg}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-rascal-dim">
            "Copy report" pastes a diagnostics snapshot (no messages, no keys) — give it to
            an AI assistant with the Rascals debug MCP server for a full analysis.
          </p>
        </div>
      )}
    </div>
  )
}
