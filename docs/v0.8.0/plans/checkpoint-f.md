--- a/docs/v0.8.0/trd.md	2026-10-23 10:40:52.766448000 +0800
+++ b/docs/v0.8.0/trd.md	2026-10-23 10:40:52.806062421 +0800
@@ -65,7 +65,8 @@
 UpdateMeleteSubjectBody   = { auto_enroll?: boolean, new_per_day?: int (0..100) }  // at least one key
 EnrollSubjectBody         = { enrolled: boolean }
 UpdateMeleteNoteBody      = { enrolled: boolean }
-GetMeleteNoteResponse     = { note: MeleteNote, questions: MeleteQuestion[] }     // active and dropped, by position
+GetMeleteNoteResponse     = { note: MeleteNote, questions: MeleteQuestion[],      // active and dropped, by position
+                              obsidian_url: string | null }                         // null when OBSIDIAN_VAULT_NAME is unset
 GetNextReviewResponse     = { item: MeleteReviewItem | null, counts: MeleteReviewCounts }
 GradeAnswerBody           = { answer: string (0..4000) }
 GradeAnswerResponse       = { outcome: 'graded', grade: MeleteGrade, run_id: int }
@@ -339,7 +340,7 @@
 | `POST /api/melete/questions/:id/grade` | `GradeAnswerBody` | `GradeAnswerResponse` |
 | `POST /api/melete/questions/:id/review` | `RecordReviewBody` | `RecordReviewResponse` |
 
-Ids validated as uuids (400). `GET` endpoints that scan answer 409 "Choose a learning root first" when it's unset (except `today`, which returns `learning_root: null`). Errors through the existing typed errors. All routes go through the four layers. `obsidian_url` is `obsidian://open?vault=<encoded name>&file=<encoded path without .md>` or null.
+Ids validated as uuids (400). `GET` endpoints that scan answer 409 "Choose a learning root first" when it's unset (except `today`, which returns `learning_root: null`). Errors through the existing typed errors. All routes go through the four layers. `obsidian_url` (on review items and on the note response) is `obsidian://open?vault=<encoded name>&file=<encoded path without .md>` or null. The `{ subject }` and `{ question }` responses carry a `MeleteSubject` and a `MeleteQuestion`; they have no named schema of their own.
 
 ## 11. Web