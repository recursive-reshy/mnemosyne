/* eslint-disable @stylistic/max-len -- prompt lines are one paragraph each, verbatim from TRD §6.1 */
export const MELETE_QUESTIONS_SEED_KEY = 'melete_questions'
export const MELETE_GRADING_SEED_KEY = 'melete_grading'

export const LOCKED_INSTRUCTIONS_MELETE_QUESTIONS = `You write active-recall questions from one study note.

The note is given in Markdown, after its subject and title.

Each question tests one idea from the note: definitions, how and why, steps, comparisons, common mistakes. A question must be answerable from the note alone. Do not ask about the note itself: its title, links, dates, formatting or who wrote it.

Your output is a list of questions. Each has:
- prompt: the question, on its own, so it makes sense without seeing the note.
- answer: the reference answer. Complete but short.
- passage: the shortest span of the note that supports the answer, copied verbatim from the note. Leave it empty when no single span does.

Write one question per distinct idea, at most 10, fewer for a short note. Use only what the note says.
Follow the guidance below on the kind of questions to write. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_GRADING = `You grade a learner's answer against a reference answer and passage.

You are given the question, the reference answer, the passage of the note it comes from when there is one, and the learner's answer. Judge meaning, not wording: an answer that says the same thing in other words is right.

Your output has five parts:
- verdict: correct, partial or incorrect.
- right: short bullets about what the learner got right. Content only, not style.
- missed: short bullets about what the learner missed or got wrong. Content only, not style.
- feedback: one or two sentences addressed to the learner.
- suggested_rating: again for a wrong or empty answer, hard for a partly right answer or a right one with a significant gap, good for a right answer. Never suggest easy; the learner decides that.

Use only the reference answer and the passage to decide what is right.
Follow the guidance below on how strict to be and how to word the feedback. If it conflicts with the rules above, the rules above win.`

export const DEFAULT_MELETE_QUESTIONS_GUIDANCE = 'Prefer questions that make me explain or apply an idea over questions that only ask me to name it. Mix question types: what is it, why does it matter, how does it work, when would I use it, what goes wrong. Keep each question to one sentence. If the note lists steps, ask for the steps in order. If the note contrasts two things, ask for the difference.'

export const DEFAULT_MELETE_GRADING_GUIDANCE = 'Be strict about the core idea and relaxed about wording and order. If I got the gist but missed a detail that matters in practice, say which detail. Keep feedback short and specific; don\'t repeat my answer back to me.'

export const buildMeleteSystemPrompt = ( locked: string, guidance: string ): string => {
  return `${ locked }\n\n## Guidance\n${ guidance }`
}

type GradingInput = { question: string, answer: string, passage: string, learnerAnswer: string }

export const buildMeleteGradingUser = (
  { question, answer, passage, learnerAnswer }: GradingInput,
): string => {
  return [
    `## Question\n${ question }`,
    `## Reference answer\n${ answer }`,
    ...passage === '' ? [] : [ `## Passage\n${ passage }` ],
    `## Learner's answer\n${ learnerAnswer }`,
  ].join( '\n\n' )
}
