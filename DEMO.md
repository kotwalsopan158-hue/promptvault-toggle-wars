# PromptVault · Two-minute demo script

Start with the **Demo** environment running. The local lab includes a real Flagsmith dashboard. Use separate browser profiles to prepare one empty library in each arm. For a dashboard with numbers, run three simulator batches, allow ingestion, and refresh the results. Keep its **Demo** label visible.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:13 | Empty library, with the onboarding card in frame. | “Think of a prompt you’ve written three times. PromptVault gives it a home. But asking someone to invent a workflow before they’ve saved anything makes the first visit feel like work.” |
| 0:13–0:29 | Control. Click **Create workflow** and show the two blank fields. | “My hypothesis is that a ready-to-edit decision brief will raise first saves by five percentage points over 72 hours. Control starts blank. Opening this editor earns no conversion.” |
| 0:29–0:51 | Guided profile. Show the inspector ID and arm, refresh, check both, then open **Use decision brief**. | “Flagsmith assigned this visitor to guided templates. Watch the last few characters of their ID. After refresh, both the ID and the arm match. The editor is identical. This time there’s a useful prompt ready to adapt.” |
| 0:51–1:08 | Edit one line and save. Show the toast, reopen the record and fill its notes field. | “The first successful database write queues first_workflow_created for that exposed visitor. Now I can reuse the prompt with fresh notes. Editing it or copying it adds no second conversion.” |
| 1:08–1:24 | Show **New Visitor Session**, completed simulator counts and **Download run receipt**. | “A new session gets a fresh identity. The simulator asks Flagsmith to assign every visitor and writes a receipt of acknowledged events. Its probabilities are programmed. This dashboard is labeled synthetic.” |
| 1:24–1:48 | Open Flagsmith’s experiment page. Show environment, **As of**, exposed counts, rates, lift, win probability and interval. | “I start with the denominator in each arm. Lift tells us the relative difference in save rates. Win probability summarizes the evidence that guided is better. The interval shows how large the gain or loss could be. If it crosses zero, the direction is still uncertain.” |
| 1:48–2:00 | Show the separate human-results table in the README. | “The synthetic run verifies the measurement path. It can’t tell us what people prefer. My product decision stays open until real visitors clear the five-point target and the uncertainty checks.” |

When reporting **human** results, say the actual counts, lift, win probability, interval and environment shown on screen. If the result says **Collecting data**, say that directly. For an offline rehearsal, use the inspector’s explicit preview and record the dashboard segment using the local lab or Cloud.
