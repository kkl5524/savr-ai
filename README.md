# Savr.ai

**Cook smarter. Waste less.**

Savr.ai is a free, AI-powered web application that turns what's already in your kitchen into personalized, health-conscious meals. Enter your available ingredients, set dietary preferences and allergy filters, and get ranked recipe matches — no account required.

Live at: **https://savr-ai.netlify.app**

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

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** v18 or later — https://nodejs.org
- **npm** v9 or later (comes with Node.js)
- **Netlify CLI** — installed in the setup steps below

You will also need accounts and API keys for:

- **Supabase** (free tier is sufficient) — https://supabase.com
- **Anthropic** (Claude API key) — https://console.anthropic.com

---

## Getting started

### Step 1 — Clone the repository

Download the savr-ai files from https://github.com/kkl5524/savr-ai

---

### Step 2 — Install dependencies

```bash
npm install
```

This installs `node-fetch` (used by the Netlify functions) and the Jest testing packages. There is no frontend build step — the HTML and JavaScript files are served directly.

---

### Step 3 — Install the Netlify CLI

```bash
npm install -g netlify-cli
```

Verify it installed correctly:

```bash
netlify --version
```

---

### Step 4 — Set up Supabase

1. Go to https://supabase.com and create a free account and a new project.
2. Once your project is created, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ`)
   - **service_role key** (long string — keep this private)

3. In the Supabase dashboard, go to **SQL Editor** and run the following scripts in this exact order. Each file is in the `scripts/` folder of the project:

   ``` bash
   1. scripts/schema.sql          — creates the recipes table
   2. scripts/nutrition_schema.sql — creates the nutrition table
   3. scripts/forum_schema.sql    — creates the forum_posts, profiles, and related tables
   4. scripts/seed_forum.sql      — modifies forum_posts to support seeded posts
   ```

   Open each file, copy the contents, paste into the Supabase SQL Editor, and click **Run**.

4. Import the recipe and nutrition datasets into Supabase. This requires Python 3 and the following packages:

   ```bash
   pip install supabase anthropic pandas tqdm python-dotenv
   ```

   Then run the import scripts (you need the Kaggle recipe dataset at https://www.kaggle.com/datasets/wilmerarltstrmberg/recipe-dataset-over-2m and USDA SR Legacy CSV files at https://fdc.nal.usda.gov/download-datasets):

   ```bash
   python scripts/import.py             # imports recipes
   python scripts/import_nutrition.py   # imports USDA nutrition data
   ```

   To seed the forum with AI-generated community posts (optional):

   ```bash
   python scripts/seed_forum.py --recipes 50 --posts 4 --replies 1
   ```

---

### Step 5 — Create your environment file

In the root of the project, create a file called `.env`:

``` bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Replace each value with the keys you copied in Step 4 and your Anthropic API key from https://console.anthropic.com.

> **Important:** Never commit the `.env` file to GitHub. It is already listed in `.gitignore`.

---

### Step 6 — Run the development server

```bash
netlify dev
```

This starts a local development server at `http://localhost:8888`. It automatically:

- Serves the frontend from the project root
- Runs the Netlify serverless functions locally
- Loads your `.env` variables into the function environment

Open `http://localhost:8888` in your browser. The app should be fully functional.

If the browser shows a blank page or console errors, check:

- That your `.env` file is saved in the project root (same folder as `index.html`)
- That `netlify dev` is running without errors in the terminal
- That you ran all four SQL scripts in Supabase successfully

---

### Step 7 — Run the tests (optional)

To run all tests:

```bash
npm test
```

To run only backend tests:

```bash
npm run test:backend
```

To run only frontend tests:

```bash
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
| --- | --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API | All Netlify functions |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API | search.js, nutrition.js |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API | forum.js (write operations) |
| `ANTHROPIC_API_KEY` | console.anthropic.com | chat.js |

---

## Deploying to Netlify (production)

1. Push your project to a GitHub repository.
2. Go to https://netlify.com, log in, and click **Add new site → Import an existing project**.
3. Connect GitHub and select your repository.
4. Set the build settings:
   - **Build command:** *(leave empty)*
   - **Publish directory:** `.`
5. Click **Deploy site**.
6. Go to **Site → Environment variables** and add all four variables from the table above.
7. Trigger a new deploy. The site will be live at a `.netlify.app` subdomain.

Every subsequent push to the `main` branch automatically redeploys.

---

## Common issues

**`netlify dev` says SUPABASE_URL not configured**
Make sure your `.env` file is in the project root (same folder as `index.html` and `netlify.toml`), not inside a subfolder.

**Recipes not loading / search returns no results**
The recipe dataset needs to be imported into Supabase first. Run `python scripts/import.py` and confirm the `recipes` table has rows in the Supabase Table Editor.

**AI chat says "trouble connecting"**
Check that `ANTHROPIC_API_KEY` is set in `.env` and that `netlify dev` was restarted after you added it. Environment variables are only loaded at startup.

**Nutrition panel shows dashes**
The nutrition dataset needs to be imported separately from the recipes. Run `python scripts/import_nutrition.py`.

**Tests fail with module not found**
Run `npm install` first to install Jest and the other dev dependencies.

---

## License

This project was built as a Penn State IST Senior Capstone project. All rights reserved.
