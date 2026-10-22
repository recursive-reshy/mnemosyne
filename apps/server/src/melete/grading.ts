const NO_ANSWER = /^(?:i\s*don['’]?t\s*know|idk|no\s*idea|pass|\?+)\.?$/i

// An answer that isn't one needs no Claude call: it is an Again
export const isBlankAnswer = ( answer: string ): boolean => {
  const trimmed = answer.trim()

  return trimmed === '' || NO_ANSWER.test( trimmed )
}
