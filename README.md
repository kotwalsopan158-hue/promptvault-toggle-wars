# PromptVault

A two-screen library for prompts worth using twice. Save a workflow, reopen it, and fill in its variables for the next task. Your prompts and the text you paste into them stay in your browser.

**Toggle Wars · Track 01 · Test Something Real**  
[Try PromptVault](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/) · [Watch the captioned demo](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/watch/) · [Inspect the recorded experiment](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/#results)

The public app opens in local preview. Choose **Experiment inspector** and **Guided template** to try the second experience, or enter a public demo environment ID in the inspector to send live events. The video follows real SDK traffic to a self-hosted Flagsmith warehouse. The app, recording and recorded result are open to visitors without signing in.

The release includes a standalone HTML app, a ZIP of the project, every source file in one Markdown download, the narrated MP4 and English captions. [Download v1.2.0](https://github.com/kotwalsopan158-hue/promptvault-toggle-wars/releases/tag/v1.2.0) · [Demo script](DEMO.md) · [Build and browser checks](https://github.com/kotwalsopan158-hue/promptvault-toggle-wars/actions/workflows/verify.yml)

## Experiment design

When someone opens an empty prompt library, does starting from an editable decision brief help them save their first useful workflow?

| Design choice | Specification |
| --- | --- |
| Audience | New browser identities who see the onboarding card in an empty, readable library |
| Hypothesis | During the first 72 hours of the experiment, guided onboarding will raise first-save conversion by at least **5 percentage points** |
| Screen 1 | **Workflow library.** An empty library offers the assigned starting point. A populated library lists the visitor’s saved workflows. |
| Screen 2 | **Workflow editor.** Both arms share the same fields, validation, storage and Save workflow button. Saved prompts can be reused here. |
| Multivariate flag | `onboarding_empty_state` |
| `control` | **Create your first workflow** opens a blank editor |
| `guided_templates` | **Start with a decision brief** opens an editable title and a prompt with a `{{notes}}` input |
| Conversion event | `first_workflow_created`, after the first successful durable save |
| Primary metric | Distinct exposed identities with a first save divided by distinct exposed identities in each arm |
| Assignment | 100% rollout into the experiment, with a 50/50 split inside it |

The 72-hour cutoff applies to both arms. A visitor can return and save before that cutoff. Someone entering late has less time to convert. Record the start and cutoff when launching the human study.

## Run the app

Install Node.js **22.12+** and npm. The project uses React, Vite, Tailwind CSS and the official `@flagsmith/flagsmith` browser SDK **12.4.0**. The lockfile pins the full dependency tree.

```sh
git clone https://github.com/kotwalsopan158-hue/promptvault-toggle-wars.git
cd promptvault-toggle-wars
npm ci
npm run dev
```

Open the local address printed by Vite. Without a key, control works immediately. Open **Experiment inspector → Offline variant preview → Guided template** to try the treatment in an empty library. A local preview sends no experiment events.

**Use a saved workflow.** Give a prompt a field such as `{{notes}}` or `{{audience}}`. Save it, then choose the braces button in the library. Enter the values and click **Copy finished prompt**. Repeated fields take the same value. Input text is transient and the saved template stays reusable. Plain prompts can be copied directly from the library.

**Take a template with you.** Open a saved workflow and choose **Export saved template (.md)**. The download contains its last saved title, editable prompt and input names. For example, a colleague receives the literal `{{notes}}` field. Your filled-in meeting notes stay in the browser. Reusing and exporting are available to both arms and do not trigger the first-save metric.

**Try the handoff in a second browser.** Open the assigned editor and expand **Import a template**. Choose the exported Markdown file, preview its prompt and inputs, then choose **Use imported template** to fill the two draft fields. You can cancel the import or edit the draft. The browser stores the workflow and evaluates the conversion only when you press **Save workflow**. Both arms use this same import flow.

### Connect a Cloud environment

Copy `.env.example` to `.env.local`. Use `Copy-Item .env.example .env.local` in PowerShell or `cp .env.example .env.local` on macOS or Linux. Set the values below and restart Vite.

| Variable | Purpose |
| --- | --- |
| `VITE_FLAGSMITH_ENV_ID` | Public **client-side** key from Flagsmith Environment Settings |
| `VITE_TRAFFIC_MODE` | `demo` enables judge controls. Use `research` with a separate environment for human participants. |

A demo build with no compiled-in key also accepts a **public demo environment ID** in the inspector for the current tab. For static hosting, set the variables before `npm run build` and serve `dist/` over HTTPS. Relative asset paths support repository subpaths. Keep administrative keys out of browser configuration.

### No Cloud account? Run the real local dashboard

With Docker Desktop or Docker Engine and Compose v2 running, execute these commands from the cloned repository.

```sh
npm ci
npm run lab
```

The first run pulls Flagsmith and PostgreSQL, configures the warehouse, creates the keyed flag and occurrence metric, starts a real 50/50 experiment and launches PromptVault. Open [the app](http://localhost:5173) and [Flagsmith](http://localhost:8000). Local dashboard login details are generated in `.promptvault-lab/credentials.json`. The database remains on your machine between runs. Press Ctrl+C to stop Vite, then run `npm run lab:stop` to stop the containers. Running `npm run lab` again reuses the environment.

The lab binds to loopback and uses the open-source PostgreSQL warehouse option intended for evaluation. The Cloud setup below is the path for a public human experiment. [Flagsmith self-hosted experimentation](https://docs.flagsmith.com/experimentation/self-hosting)

The lab also creates **Participant rehearsal**, with a separate environment key, metric and experiment. The terminal prints a participant URL for the local app. Automated checks run the participant code path there with one scripted visitor. These checks do not provide human study data.

## Flagsmith Cloud setup

1. Create or select a Flagsmith project and select its **Demo** environment. You can dedicate the existing **Development** environment to the demo. Under **Environment Settings**, copy its **client-side environment key**.
2. Open **Environment Settings → Warehouse → Flagsmith → Enable**. Confirm, then choose **Send your first event**. Wait for **Connected**. Processing the first event can take a few hours. [Warehouse setup](https://docs.flagsmith.com/experimentation/connect-a-warehouse)
3. Open **Features → Create Feature**. Name the flag `onboarding_empty_state`. Enable it, select the **String** value type and enter `control` as the base value. Keep the flag visible to client-side SDKs.
4. Open the flag’s multivariate options (**Create A/B/n Test** in the flag editor). Keep the existing base as control and add one string variation. Set both its **key** and **value** to `guided_templates`. Give that row an ordinary flag allocation of **0%**, leaving the default base at 100% outside the experiment. Save and verify the flag is enabled in this environment. Flagsmith reserves `control` for the flag’s own value. Every added variation needs its own explicit key. [Flag controls](https://docs.flagsmith.com/managing-flags/core-management) · [Variation keys](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent)
5. Open **Metrics → Create Metric**. Use **First workflow save rate** for the name, **Occurrence** for aggregation, and **Higher is better** for direction. Enter `first_workflow_created` exactly in **Event name** and save. [Metric setup](https://docs.flagsmith.com/experimentation/create-metrics)
6. Open **Experiments → Create Experiment**. Name it **First workflow onboarding**, enter the hypothesis above and select `onboarding_empty_state`.
7. Under **Rollout configuration**, set overall rollout to **100%** and choose **Split evenly**. Verify `guided_templates` gets 50% and the remaining 50% goes to `control`. These are the experiment weights.
8. Under **Measurement**, select **First workflow save rate** as the primary metric and **Increase** as its expected direction. Review the environment, metric and split. Click **Create Experiment** in **Review & Launch** and verify **Running**. Keep the allocation fixed while measuring. [Experiment wizard](https://docs.flagsmith.com/experimentation/create-an-experiment)
9. Open PromptVault and confirm **Live · Flagsmith**, **Enrolled**, the ID and arm in the inspector. Close it to expose the library card. Refresh before saving and check that the ID and arm match. Save a workflow, verify the conversion toast, then open the experiment in Flagsmith.
10. After ingestion, click **Refresh results**. Check **As of**, exposed counts, conversion rate, **Delta**, **Win Probability** and **Credible Interval (95%)** for each arm. Result refresh is limited to once every five minutes. [Reading results](https://docs.flagsmith.com/experimentation/analyse-an-experiment)

### Invite participants to a human study

1. In a **separate research environment**, repeat the warehouse, metric and experiment setup above. Confirm **Running** and record the planned 72-hour start and cutoff.
2. Open **Participant links** in the public app. Enter the **public client-side ID** from the research environment, then choose **Check flag and create link**. The check reads the flag without creating an identity or sending an exposure. [Open the link builder](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/#participants)
3. Copy the generated URL and give the same link to participants. It contains only the app address and public research environment ID. Each browser creates its own stable participant ID. The study opens the normal workspace and hides the inspector, arm previews, reset and simulator.
4. Read the **research** experiment in Flagsmith. A person who tried the demo on the same browser receives a separate research library and stable ID. A malformed study link opens a local workspace with tracking paused. A dedicated deployment can still use `VITE_TRAFFIC_MODE=research` with its build-time public key.

Creating or copying a link sends no invitation. The flag check verifies that the feature exists, is enabled and has a supported base value. Experiment status, warehouse health and the metric are visible in Flagsmith.

## How the experiment works

| Moment | Behavior |
| --- | --- |
| First visit | Creates a random `pv_` ID and persists it under `localStorage.user_id` in the regular workspace. A participant URL uses `promptvault.study.<environment>.user_id` on the same origin. Reopening that URL retains the participant ID and private library. |
| Evaluation | Initializes with the visitor ID, `enableAnalytics: true` and `enableEvents: true`. A new judge identity calls `identify` on the active client. A fresh server response and `getValue` determine the arm. |
| Exposure | After a real empty-state card is rendered in a visible tab, `getExperimentFlag` records `$flag_exposure` for an enrolled identity. A covered card waits until the inspector closes. Opening a populated library produces no onboarding exposure. |
| Conversion | An IndexedDB transaction checks the owner’s record count and commits the workflow. Only a successful first write under an exposed identity calls `trackEvent('first_workflow_created', { identifier, metadata })`. Simultaneous saves in different tabs produce one first save. |
| Delivery | The SDK buffers events. The app flushes after manual exposure and conversion, when the page is hidden, and at the end of each simulation. Foreground batches use ordinary requests. Small event requests may use keepalive when the page is hidden. Toasts say **queued**. The warehouse confirms attribution. |
| Failure | A missing key, unreachable API, unknown value, or invalid experiment key selects local control. Conversion tracking stays quiet. A live flag outside rollout can render without enrolling the user. Failed writes keep the draft open. |

Browser profiles and devices have independent identities. Clearing site data removes the local ID and workflows. A crash between a committed save and telemetry delivery can lose a conversion. Workflow names, prompts and filled inputs never appear in the events. [Official JavaScript SDK lifecycle](https://docs.flagsmith.com/experimentation/run-an-experiment)

## Inspector and synthetic traffic

**New Visitor Session** creates a new ID and opens that visitor’s library. Consecutive visitors may legitimately get the same arm. **Simulate 100 Visitors** uses a separate SDK client and 100 distinct IDs, one identity evaluation at a time. Flagsmith assigns the actual arm. The runner samples one possible save at **16% for control** or **29% for guided templates**. It calls `flushEvents()` even after a partial run.

The inspector shows per-arm queued exposures and saves, skipped visitors, and the number of distinct identities acknowledged by the ingestion endpoint. It excludes individually rejected events from its receipt and displays **Delivery incomplete** when the totals differ. **Download run receipt** saves those counts, the experiment ID, timestamps and programmed rates as JSON. A 2xx ingestion response still precedes warehouse analysis. Only human traffic in the research environment measures the product hypothesis.

**Event trace** follows one demo visitor from the visible onboarding card to the first successful save. It shows the visitor ID, assignment, queue times, and the individual outcome Flagsmith returned for each event. A retry can confirm an earlier failed attempt. An ambiguous or empty response stays **Unconfirmed**. The trace survives refresh in the same tab, excludes simulator identities and omits workflow text. Download the JSON to inspect it. [Open the event trace](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/#trace)

Without a live enrollment, **Event trace** opens a labeled example from a scripted visitor on 27 November 2026. Its two HTTP 202 acknowledgments came from a real Flagsmith server. The same verification run opened a participant link in a separate experiment, refreshed, and saved. That warehouse counted one exposed visitor and one first save. Both observations are automated rehearsals. [Trace JSON](evidence/visitor-trace.json) · [Warehouse verification](https://github.com/kotwalsopan158-hue/promptvault-toggle-wars/actions/runs/46039120780)

Choose **Recorded result** to inspect the dated warehouse snapshot alongside the running visitor session. It shows saves over exposures, relative lift, win probability, and a 95% credible interval drawn across a zero line. **Verify the warehouse run** opens the run behind those numbers. The snapshot stays fixed while you run fresh batches. [Open the result directly](https://kotwalsopan158-hue.github.io/promptvault-toggle-wars/#results)

## Experiment results

### Verified synthetic run

A real self-hosted Flagsmith 2.295.2 server assigned all arms and computed the following snapshot on 27 November 2026. Three 100-visitor batches produced 68 saves. One additional scripted browser visitor refreshed the page and saved once. The warehouse counted 301 distinct exposed identities and 69 converters. [Recorded Flagsmith output](evidence/synthetic-flagsmith.json) · [Reproducible run](https://github.com/kotwalsopan158-hue/promptvault-toggle-wars/actions/runs/45919688828)

| Arm | Exposed identities | First saves | Save rate |
| --- | ---: | ---: | ---: |
| `control` | 145 | 28 | 19.31% |
| `guided_templates` | 156 | 41 | 26.28% |

The observed difference was **+6.97 percentage points**, or **+36.1% relative lift**. Flagsmith reported an **88.9% win probability** for guided and a **95% credible interval for relative lift from −21.8% to +94.0%**. Both harm and benefit fit this interval. The warehouse returned no sample-ratio-mismatch statistic for this snapshot. The programmed save probabilities drive these observations. They verify the event pipeline and provide no basis for choosing onboarding for real people.

### Human study

The human study awaits recruitment. This submission contains no measured human conversion rate, lift, win probability or credible interval.

| Human arm | Exposed | First saves | Conversion rate | Relative lift | Win probability | 95% credible interval for lift |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `control` | Awaiting traffic | — | — | Baseline | — | — |
| `guided_templates` | Awaiting traffic | — | — | — | — | — |

**Read the denominator first.** Conversion rate is converted identities divided by exposed identities. Subtract the control rate from the guided rate for the absolute change in percentage points. Divide that change by the control rate for relative lift. When control has zero conversions, report the absolute change and leave observed relative lift undefined.

**Reading the example above.** Guided saved 41/156 and control saved 28/145. Subtract the two rates to get 0.0697, or 6.97 percentage points. Divide 0.0697 by the control rate of 0.1931 to get 0.361, or 36.1% relative lift.

**Win probability** is the model’s probability that the treatment beats control given the observed data. The **95% credible interval** gives a range containing 95% of the model’s posterior probability for the lift. An interval crossing zero allows both a gain and a loss. A positive point estimate alone cannot settle the decision. When Flagsmith shows **Collecting data**, report that status. Each arm needs at least 50 identities and five conversions for occurrence analysis. Investigate a sample ratio mismatch or a growing number of excluded identities before interpreting an effect. [Statistics glossary](https://docs.flagsmith.com/experimentation/statistics)

**Decision rule.** At the 72-hour cutoff, support rollout only when the human study has healthy assignment, an observed gain of at least five percentage points, win probability of at least 95%, and a lift interval wholly above zero. A wholly negative interval favors control. With low volume or an interval crossing zero at the cutoff, record this study as inconclusive. Set a new measurement window before gathering further evidence.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

The unit tests cover attribution, atomic first saves, retries, Markdown round trips and event acknowledgments. The browser suite runs the production build, intercepts HTTP from the actual SDK and checks both variants, repeated saves, participant isolation, a partially rejected batch, offline mobile use and a template handoff between browser profiles. Run this suite with the build-time environment ID blank and demo mode enabled.

A separate [warehouse verification job](https://github.com/kotwalsopan158-hue/promptvault-toggle-wars/actions/workflows/flagsmith-lab.yml) starts the real local stack, runs a scripted save and three 100-visitor batches through the app, and checks Flagsmith’s returned occurrence totals against accepted events. The job uses an isolated database and never touches Cloud.

The recording workflow starts its own Flagsmith warehouse, finds two real assignments, films a save and a separate simulator batch, and checks that the downloaded Markdown omits the filled notes. It retrieves this run's results from Flagsmith before showing the dated snapshot. The renderer adds synchronized narration and captions, then decodes the finished MP4 to verify it. The release workflow also opens the deployed app, follows the evidence link and plays the video in a signed-out browser. [Recording workflow](.github/workflows/demo-film.yml) · [Spoken transcript](demo/narration.json)

## Source map

| Location | Responsibility |
| --- | --- |
| `src/main.jsx`, `src/workspace.js` | Two-screen flow, visibility gate, persistent identity and atomic workflow saves |
| `src/experiment.js`, `src/runtime.js`, `src/receipts.js` | SDK lifecycle, enrollment checks, event delivery, traffic isolation and receipts |
| `src/Library.jsx`, `src/Editor.jsx`, `src/PromptFill.jsx` | Library, shared editor and local reusable inputs |
| `src/Inspector.jsx`, `src/RecordedResult.jsx` | Assignment, simulator receipts and the recorded warehouse result |
| `src/visitor-trace.js`, `src/TracePanel.jsx` | Current visitor's joined events and per-event delivery outcomes |
| `src/study.js`, `src/StudyLinks.jsx` | Participant URLs, research environment checks and isolated identities |
| `src/export-template.js`, `src/ImportTemplate.jsx` | Local Markdown export, file validation and import preview |
| `lab/` | Local Flagsmith server setup and real warehouse verification |
| `demo/` | Public player, recording script, narration, captions renderer and public playback check |
| `tests/` | Unit and production-browser tests |
| `DEMO.md` | A timed script for a two-minute recording |
