const segmenter = new Intl.Segmenter()
function shorten(text, limit) {
  let output = ''
  let count = 0
  let bytes = 0
  for (const { segment } of segmenter.segment(text)) {
    bytes += Buffer.byteLength(segment, 'utf8')
    if (count++ === limit || bytes > 2500) return output + '…'
    output += segment
  }
  return output
}

export function pushPayload(job) {
  const sender = job.sender_nickname || 'Our Space'
  // claim_push replaces private content before it reaches the push server.
  // Defensive second layer: never reuse an arbitrary private body here.
  if (job.title === 'Private Request')
    return {
      entry: job.event_id,
      title: sender + ' ❤️‍🔥 · Private Request',
      body: 'Open Our Space to view a private request.',
    }
  return {
    entry: job.event_id,
    title: sender + ' ❤️' + (job.title ? ' · Attention Request' : ''),
    body: shorten(
      job.title
        ? job.title + ' — ' + job.body
        : job.body || 'You have a new message.',
      180,
    ),
  }
}
