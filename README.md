# Savr.ai

**Cook smarter. Waste less.**

Savr.ai is a free, AI-powered web application that turns what's already in your kitchen into personalized, health-conscious meals. Enter your available ingredients, set dietary preferences and allergy filters, and get ranked recipe matches — no account required.

Live at: **https://savr-ai.netlify.app**

---

## Quickstart — just want to use it?

Go to **https://savr-ai.netlify.app** in any browser. No account, no installation, no setup required.

The rest of this README is for running the project locally to make code changes.

---

## What it does

- **Ingredient-first recipe search** — enter what you have, get ranked recipe matches sorted by fewest missing ingredients
- **Allergy and dietary filtering** — hard enforcement at the database level, not just visual labels
- **7-day meal planner** — drag-and-drop, servings tracking, and persistent across sessions
- **Store-ready shopping list** — subtracts your pantry and converts recipe quantities to purchasable units
- **AI cooking assistant** — context-aware chat for any recipe step or meal plan, with health guardrails
- **Community forum** — per-recipe tips panel with AI-generated summaries

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript (no framework, no build step) |
| Backend | Netlify serverless functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| AI | Anthropic Claude API (claude-haiku-4-5-20251001) |
| Hosting | Netlify |
| Testing | Jest (backend: node, frontend: jsdom) |

---

## Running locally

There are two ways to run the project locally. **GitHub Codespaces is recommended** — it requires no software installation on your computer and works in any browser.

---

### Option A — GitHub Codespaces (recommended, nothing to install)

GitHub Codespaces runs the project in a cloud environment directly from your repository. No Node.js, no Netlify CLI, and no admin permissions needed on your computer.

**Step 1 — Open a Codespace**

1. Go to the repository on GitHub
2. Click the green **Code** button
3. Click the **Codespaces** tab
4. Click **Create codespace on main**

Wait about a minute for the environment to load. A full VS Code editor will open in your browser with a terminal at the bottom.

**Step 2 — Install dependencies**

In the Codespaces terminal, run:

```bash
npm install
npm install -g netlify-cli
```

**Step 3 — Set up Supabase**

You need a free Supabase account and project to use the recipe search, nutrition, and forum features.

1. Go to https://supabase.com, create a free account, and create a new project
2. Once it loads, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ`)
   - **service_role key** (long string — keep this private)
3. In the Supabase dashboard, click **SQL Editor** in the left sidebar
4. Run each of the following files in order — open the file in the Codespaces editor, copy the contents, paste into the Supabase SQL Editor, and click **Run**:

```
1. scripts/schema.sql           — creates the recipes table
2. scripts/nutrition_schema.sql — creates the nutrition table
3. scripts/forum_schema.sql     — creates the forum and profiles tables
4. scripts/seed_forum.sql       — adds support for seeded forum posts
```

5. Import the recipe and nutrition datasets. In the Codespaces terminal:

```bash
pip install supabase anthropic pandas tqdm python-dotenv
python scripts/import.py             # imports recipes (takes a few minutes)
python scripts/import_nutrition.py   # imports USDA nutrition data
```

**Step 4 — Create your .env file**

In the Codespaces file explorer, create a new file in the project root called `.env`. Paste the following and fill in your values:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Your Anthropic API key is available at https://console.anthropic.com.

> **Important:** The `.env` file is already listed in `.gitignore` and will not be committed to GitHub.

**Step 5 — Start the app**

```bash
netlify dev
```

Codespaces will show a notification that a port is available. Click **Open in Browser** and the app will open in a new tab, fully functional.

---

### Option B — Running locally on your own machine

This option requires Node.js v18+, npm, Git, and Netlify CLI installed on your computer.

**Step 1 — Clone the repository**

```bash
git clone https://github.com/your-username/savr-ai.git
cd savr-ai
```

**Step 2 — Install dependencies**

```bash
npm install
npm install -g netlify-cli
```

**Step 3 — Set up Supabase and create your .env file**

Follow Steps 3 and 4 from Option A above — the Supabase setup and `.env` file are identical regardless of how you run the project.

**Step 4 — Start the app**

```bash
netlify dev
```

Open `http://localhost:8888` in your browser.

---

## Running the tests

```bash
npm test
```

To run only backend or frontend tests:

```bash
npm run test:backend
npm run test:frontend
```

You should see 74 tests across 5 test suites, all passing.

---

## Project structure

```
savr-ai/
├── index.html                  # Single-page app entry point
├── netlify.toml                # Netlify config — function routes and publish dir
├── package.json                # Node dependencies and test scripts
├── .env                        # Your local environment variables (not committed)
│
├── css/
│   └── styles.css              # All application styles
│
├── js/                         # Frontend JavaScript modules
│   ├── app.js                  # Entry point — initialises all modules
│   ├── state.js                # Shared state and localStorage helpers
│   ├── ingredients.js          # Ingredient input, tags, and editing
│   ├── filters.js              # Allergy, dietary, appliance, and cuisine chips
│   ├── search.js               # NER extraction and recipe search
│   ├── recipes.js              # Recipe cards, modal, and nutrition panel
│   ├── nutrition.js            # USDA nutrition lookup and parsing
│   ├── mealplan.js             # 7-day meal plan and drag-and-drop
│   ├── grocery.js              # Shopping list generation and unit conversion
│   ├── forum.js                # Community tips panel
│   ├── chat.js                 # AI chat bubble and panel
│   ├── auth.js                 # Supabase authentication
│   └── data.js                 # Sample recipes and fallback data
│
├── netlify/
│   └── functions/              # Serverless backend functions
│       ├── search.js           # Recipe search via Supabase GIN index
│       ├── nutrition.js        # USDA nutrition lookup
│       ├── forum.js            # Forum CRUD, upvotes, AI summary
│       └── chat.js             # Claude AI chat with health guardrails
│
├── scripts/                    # Database setup and data import
│   ├── schema.sql              # Recipes table schema
│   ├── nutrition_schema.sql    # Nutrition table schema
│   ├── forum_schema.sql        # Forum tables and RPCs
│   ├── seed_forum.sql          # Forum migration for seeded posts
│   ├── import.py               # Kaggle recipe dataset importer
│   ├── import_nutrition.py     # USDA SR Legacy dataset importer
│   └── seed_forum.py           # AI forum post generator
│
└── tests/
    ├── backend/
    │   ├── search.test.js          # Search function unit tests
    │   ├── forum_sanitise.test.js  # XSS sanitisation tests
    │   └── chat_guardrails.test.js # AI health guardrail tests
    └── frontend/
        ├── filters_and_search.test.js  # NER, coverage, ingredient logic tests
        └── dom_rendering.test.js       # DOM rendering tests
```

---

## Environment variables

| Variable | Where to get it | Used by |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API | All Netlify functions |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API | search.js, nutrition.js |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API | forum.js (write operations) |
| `ANTHROPIC_API_KEY` | console.anthropic.com | chat.js |

The `.env` file is only needed when running locally or in Codespaces. The live deployed site at `https://savr-ai.netlify.app` already has these configured in the Netlify dashboard.

---

## Deploying to Netlify (production)

1. Push your project to a GitHub repository
2. Go to https://netlify.com, log in, and click **Add new site → Import an existing project**
3. Connect GitHub and select your repository
4. Set the build settings:
   - **Build command:** *(leave empty)*
   - **Publish directory:** `.`
5. Click **Deploy site**
6. Go to **Site → Environment variables** and add all four variables from the table above
7. Trigger a new deploy — the site will be live at a `.netlify.app` subdomain

Every subsequent push to the `main` branch automatically redeploys.

---

## Common issues

**Port forwarding notification doesn't appear in Codespaces**
Click the **Ports** tab at the bottom of the Codespaces editor, find port 8888, and click the globe icon to open it in a browser.

**Recipes not loading / search returns no results**
The recipe dataset needs to be imported into Supabase first. Run `python scripts/import.py` and confirm the `recipes` table has rows in the Supabase Table Editor before testing search.

**AI chat says "trouble connecting"**
Check that `ANTHROPIC_API_KEY` is set correctly in your `.env` file and that you restarted `netlify dev` after creating or editing the file. Environment variables are only loaded at startup.

**Nutrition panel shows dashes**
The nutrition dataset is imported separately from the recipes. Run `python scripts/import_nutrition.py` to populate the nutrition table.

**SQL Editor returns an error about an existing function**
If `forum_schema.sql` or `seed_forum.sql` errors on a function that already exists, run the DROP commands shown in the error first, then re-run the file.

**Tests fail with module not found**
Run `npm install` first to install Jest and the other dev dependencies before running `npm test`.

---

## License

This project was built as a Penn State IST Senior Capstone project. All rights reserved.
