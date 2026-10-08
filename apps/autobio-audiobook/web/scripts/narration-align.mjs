/** Fits sentence timing to the narrator's pauses. Times are in seconds. */

const round = value => Math.round(value * 1000) / 1000

/** Stretches quieter than the threshold. The narration is clean speech, so a fixed level works. */
export function findSilences(samples, sampleRate, { frame = 0.01, threshold = -42, minimum = 0.1 } = {}) {
  const size = Math.max(1, Math.round(sampleRate * frame))
  const frames = Math.floor(samples.length / size)
  const silences = []
  let start = -1
  const close = end => {
    if (start >= 0 && (end - start) * frame >= minimum - 1e-9) silences.push({ start: round(start * frame), end: round(end * frame) })
    start = -1
  }
  for (let index = 0; index < frames; index++) {
    let energy = 0
    for (let sample = index * size; sample < (index + 1) * size; sample++) energy += samples[sample] ** 2
    const quiet = 10 * Math.log10(energy / size + 1e-12) < threshold
    if (quiet && start < 0) start = index
    else if (!quiet && start >= 0) close(index)
  }
  close(frames)
  return silences
}

/**
 * The audiobook spreads a paragraph's sentences over its length by character count. A sentence
 * inside a paragraph starts where the voice resumes after the nearest long pause instead.
 */
export function alignSentences(cues, estimated, silences, { lead = 0.12, reach = 2, pause = 0.35 } = {}) {
  const aligned = cues.map(cue => ({ ...cue }))
  for (const index of [...estimated].sort((a, b) => a - b)) {
    if (index <= 0 || index >= cues.length) continue
    const guess = cues[index].start
    const earliest = aligned[index - 1].start + 0.5
    const latest = cues[index].end
    let best = null
    let bestScore = -Infinity
    for (const silence of silences) {
      const length = silence.end - silence.start
      const onset = silence.end - lead
      if (length < pause || Math.abs(silence.end - guess) > reach || onset <= earliest || onset >= latest) continue
      const score = length - 0.15 * Math.abs(silence.end - guess)
      if (score > bestScore) {
        best = silence
        bestScore = score
      }
    }
    if (!best) continue
    aligned[index].start = round(best.end - lead)
    aligned[index - 1].end = aligned[index].start
  }
  return aligned
}

/**
 * The voice stops, then the closing music fades in. That gap is the longest pause in the last cue;
 * breaths inside the sentence are shorter, and the music's fade at the very end is not a pause.
 */
export function findOutro(cues, silences, { pause = 0.4, after = 0.5, tail = 5 } = {}) {
  const last = cues.at(-1)
  let best = null
  for (const silence of silences) {
    const length = silence.end - silence.start
    if (silence.start <= last.start + after || silence.end >= last.end - tail || length < pause) continue
    if (!best || length > best.end - best.start) best = silence
  }
  return best ? round(best.start + 0.1) : null
}
