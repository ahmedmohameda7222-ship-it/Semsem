import { useCallback, useEffect, useState } from 'react'
import { Clock3, PhoneIncoming, PhoneOutgoing, RefreshCw, X } from 'lucide-react'
import { db, unwrap } from './data'
import { formatCallDuration, formatTalkTime } from './callQuality'
import { ErrorMessage } from './ui'

type LoggedCall = {
  id: string
  caller_id: string
  recipient_id: string
  status: 'ringing' | 'answered' | 'declined' | 'cancelled' | 'missed' | 'ended'
  created_at: string
  connected_at: string | null
  ended_at: string | null
}
type Totals = {
  total_attempts: number
  connected_calls: number
  total_seconds: number
}
const pageSize = 30

function talkSeconds(call: LoggedCall): number | null {
  if (!call.connected_at) return null
  const elapsed = (Date.parse(call.ended_at ?? new Date().toISOString()) -
    Date.parse(call.connected_at)) / 1000
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null
}
function callStatus(call: LoggedCall): string {
  if (call.connected_at) return call.status === 'ended' ? 'Completed' : 'In call'
  if (call.status === 'missed') return 'Missed'
  if (call.status === 'declined') return 'Declined'
  if (call.status === 'cancelled') return 'Cancelled'
  if (call.status === 'ended') return 'Not connected'
  return call.status === 'ringing' ? 'Ringing' : 'Connecting'
}
export function CallHistory({
  me,
  partner,
  close,
}: {
  me: string
  partner: string
  close: () => void
}) {
  const [rows, setRows] = useState<LoggedCall[]>([])
  const [totals, setTotals] = useState<Totals>()
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (nextPage: number, append: boolean) => {
    setBusy(true)
    setError('')
    try {
      const [summary, recent] = await Promise.all([
        db.from('call_history_totals').select('*').single(),
        db.from('voice_calls')
          .select('id,caller_id,recipient_id,status,created_at,connected_at,ended_at')
          .eq('logged', true)
          .order('created_at', { ascending: false })
          .range(nextPage * pageSize, (nextPage + 1) * pageSize - 1),
      ])
      const stats = unwrap(summary) as Totals
      const records = unwrap(recent) as LoggedCall[]
      setTotals(stats)
      setRows((previous) => append ? [
        ...new Map([...previous, ...records].map((call) => [call.id, call])).values(),
      ] : records)
      setPage(nextPage)
      setMore(records.length === pageSize)
    } catch {
      setError('Could not load call history. Check your connection and retry.')
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => { void load(0, false) }, [load])
  return (
    <section className="call-history-panel" role="region" aria-label="Call history">
      <div className="row spread">
        <h4>Our calls ♡</h4>
        <div className="row">
          <button className="chat-action" type="button" disabled={busy}
            aria-label="Refresh call history" onClick={() => void load(0, false)}>
            <RefreshCw size={17} />
          </button>
          <button className="chat-action" type="button"
            aria-label="Close call history" onClick={close}>
            <X size={18} />
          </button>
        </div>
      </div>
      <p className="hint">Our call memories from today onward.</p>
      <div className="call-history-stats">
        <div>
          <strong>{totals?.connected_calls ?? '—'}</strong>
          <small>Connected calls</small>
        </div>
        <div>
          <strong>{totals?.total_attempts ?? '—'}</strong>
          <small>Total calls</small>
        </div>
        <div>
          <strong>{totals ? formatTalkTime(totals.total_seconds) : '—'}</strong>
          <small>Total talk time</small>
        </div>
      </div>
      {busy && rows.length === 0 && <p className="hint" role="status">Loading call history…</p>}
      <ErrorMessage value={error} />
      {error && <button className="outline" type="button"
        onClick={() => void load(0,false)}>Retry</button>}
      {!busy && !error && totals?.total_attempts === 0 &&
        <p className="hint call-history-empty">No calls yet. Your history starts from now ♡</p>}
      <div className="call-history-list">
        {rows.map((call) => {
          const incoming = call.recipient_id === me
          const duration = talkSeconds(call)
          return (
            <div className="call-history-row" key={call.id}>
              {incoming ? <PhoneIncoming size={18} aria-hidden="true" /> :
                <PhoneOutgoing size={18} aria-hidden="true" />}
              <div className="call-history-details">
                <strong>{incoming ? 'Incoming from ' : 'Outgoing to '}{partner}</strong>
                <small>{new Date(call.created_at).toLocaleString(undefined,{
                  day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
                })}</small>
              </div>
              <div className="call-history-meta">
                <small>{callStatus(call)}</small>
                <span>
                  <Clock3 size={13} aria-hidden="true" />
                  {duration === null ? '—' : formatCallDuration(duration)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {more && <button className="link-btn" type="button"
        disabled={busy} onClick={() => void load(page + 1, true)}>Load older calls</button>}
    </section>
  )
}
