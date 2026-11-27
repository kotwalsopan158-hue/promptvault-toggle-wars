# PromptVault · Two-minute demo script

The published recording follows one first save from the onboarding card to Flagsmith’s acknowledgment, transfers the saved template to a new browser, and shows a participant link in use. The warehouse and the recorded credible interval finish the story. [Watch the narrated demo](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/watch/) · [Exact narration](demo/narration.json)

For a live presentation, use two browser profiles with empty libraries in different live arms. Keep the inspector closed when showing an onboarding card. Prepare the experiment dashboard and the recorded synthetic result in separate tabs. Show the snapshot when quoting the numbers below, or read the figures from your own dashboard. The recording can display the current warehouse results through the Flagsmith results API when the dashboard frontend is unavailable. [Recorded result](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/#results) · [Source data](evidence/synthetic-flagsmith.json)

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:16 | Empty library, then the blank control editor. | “Think of the last prompt you typed twice. PromptVault gives it a home. Could an editable decision brief earn five more first saves per hundred visitors over 72 hours? Here’s control.” |
| 0:16–0:30 | Guided visitor. Show the ID and arm, refresh, then open the guided editor. | “Flagsmith assigned this visitor to guided templates. Watch the end of the ID as I refresh. Same ID, same brief ready to edit.” |
| 0:30–0:46 | Rename the workflow, save, and open **Event trace**. | “I’ll save my release handoff. The trace shows two acknowledgments under one visitor ID. Flagsmith received the onboarding exposure, then the first successful save.” |
| 0:46–1:03 | Fill a prompt, export its Markdown, and import it in a second browser. | “I can use my own release notes. A teammate gets the reusable template in Markdown. They can review it, change it and decide whether to save. My filled notes stay here.” |
| 1:03–1:18 | Show a simulator receipt, then open **Participant links**. | “The simulator generated a hundred distinct visitors with programmed save probabilities. To study people, I check a separate research environment and copy its participant link.” |
| 1:18–1:39 | Open the participant workspace, then show the warehouse and dated snapshot. | “Participants see their assigned onboarding. Here are the two denominators in the recorded synthetic run. Control had 28 first saves from 145 visitors. Guided had 41 from 156.” |
| 1:39–2:00 | Hold on the credible interval and its zero line. | “That’s about seven extra saves per hundred, or 36 percent relative lift. Guided had an 89 percent chance of beating control. The 95 percent interval spans 22 percent worse to 94 percent better. These visitors were scripted. Human impact is still an open question.” |

If a fresh dashboard shows **Collecting data**, say so and show its exposure counts. A recording made without a Cloud account can use the real local dashboard started by `npm run lab`. An offline UI preview is labeled on screen and sends no events.
