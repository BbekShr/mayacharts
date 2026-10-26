# Evals

Known-answer cases for `/org-eval` (agent-org plugin). Each case checks out `base` (the parent of
a real fix) in an isolated worktree, runs the named agent on the Task, and has a different model
score the answer against Expected with the Rubric. Results go in `results/` (one file per run) and
the scores into the board report. Mine new cases from history with `/org-eval mine`.

Cases here are mined from mayaCharts' own fixes. Every file a Task names exists at its `base`.
