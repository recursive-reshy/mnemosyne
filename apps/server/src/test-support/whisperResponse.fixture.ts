export const whisperResponseFixture = {
  task: 'transcribe',
  language: 'english',
  duration: 3.514812469482422,
  text: ' Hello from MemoSign, this is a quick transcription test.\n',
  segments: [
    {
      id: 0,
      text: ' Hello from MemoSign, this is a quick transcription test.',
      start: 0.0,
      end: 3.52,
      tokens: [ 2425, 490, 8731, 78, 50, 788, 11, 341, 307, 257, 1702, 35288, 1500, 13 ],
      words: [
        { word: ' Hello', start: 0.05, end: 0.42, t_dtw: -1, probability: 0.9082425236701965 },
        { word: ' from', start: 0.42, end: 0.76, t_dtw: -1, probability: 0.9737990498542786 },
      ],
      temperature: 0.0,
      avg_logprob: -0.10283029079437256,
      no_speech_prob: 1.9276742023066618e-05,
    },
  ],
  detected_language: 'english',
  detected_language_probability: 0.9997723698616028,
  language_probabilities: { en: 0.9997723698616028 },
}
