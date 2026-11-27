# PromptVault · Two-minute demo script

Use two browser profiles with empty libraries in different live arms. Keep the inspector closed when showing an onboarding card. Prepare the experiment dashboard and the [recorded synthetic result](evidence/synthetic-flagsmith.json) in separate tabs. The numbers below come from the linked snapshot. Show that snapshot when quoting them, or read the figures from your own dashboard if they differ.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:12 | Empty workflow library. | “Think of the last prompt you typed twice. PromptVault lets you save it as a workflow. The hard part is the first visit, when the library is empty.” |
| 0:12–0:27 | Control card, then **Create workflow**. Show the blank name and prompt. | “Would an editable decision brief help someone get started? My target is five extra first saves per hundred exposed visitors over 72 hours. This is control. Both fields start empty.” |
| 0:27–0:47 | Guided profile. Open the inspector, point to the ID and arm, refresh and reopen it. Close it and click **Use decision brief**. | “Flagsmith assigned this visitor to guided templates. Watch the end of the visitor ID as I refresh. Same ID, same arm. Here’s the same editor, with a decision brief ready to adapt.” |
| 0:47–1:05 | Edit a sentence, save, pause on the toast, then reopen the saved prompt. | “I’ll change one line and save. Once the workflow is stored, the app queues first_workflow_created for the same identity that saw the onboarding card. I can reuse it with fresh notes. Editing it won’t count twice.” |
| 1:05–1:21 | Inspector. Point to **New Visitor Session**, **Simulate 100 Visitors** and a finished receipt. | “New Visitor Session asks Flagsmith to assign a fresh ID. The simulator uses its own client. It samples saves at sixteen or twenty-nine percent, depending on the assigned arm. The receipt counts acknowledged events.” |
| 1:21–1:49 | Flagsmith **Results** tab, then the verified snapshot. Show the two denominators, delta, win probability and interval. | “In this synthetic run, control got 28 saves from 145 visitors. Guided got 41 from 156. That’s about seven extra saves per hundred, or 36 percent relative lift. Flagsmith gave guided an 89 percent chance of beating control. The 95 percent interval ran from 22 percent worse to 94 percent better.” |
| 1:49–2:00 | Hold on the interval, then show the human study status in the README. | “Zero is inside that interval, and every visitor here was scripted. We’ve tested that the measurement works. The product decision stays open until we see first saves from real visitors in each arm.” |

If a fresh dashboard shows **Collecting data**, say so and show its exposure counts. A recording made without a Cloud account can use the real local dashboard started by `npm run lab`. An offline UI preview is labeled on screen and sends no events.
