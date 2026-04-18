"""
scripts/seed_forum.py
─────────────────────
Generates realistic community forum posts for recipes using Claude,
then seeds them into Supabase.

Run seed_forum.sql in Supabase SQL Editor FIRST, then:
  pip install supabase anthropic pandas tqdm python-dotenv
  python scripts/seed_forum.py

Options:
  --recipes N     Number of recipes to seed (default: 50)
  --posts N       Posts per recipe (default: 4)
  --replies N     Replies per post (default: 1)
  --offset N      Skip first N recipes (for resuming)
"""

import argparse
import os
import sys
import time
import random
import json
import re
import anthropic
import pandas as pd
from tqdm import tqdm

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client

SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_KEY     = os.environ["SUPABASE_KEY"]
ANTHROPIC_KEY    = os.environ["ANTHROPIC_API_KEY"]

# ── Persona pool — realistic home cook names ──────────────────────────────
PERSONAS = [
    "Jamie K.", "Sarah M.", "Tom B.", "Priya R.", "Lucas F.",
    "Emma W.", "Aisha D.", "Marco T.", "Lily C.", "Diego R.",
    "Hannah S.", "Raj P.", "Chloe N.", "Oliver H.", "Fatima A.",
    "Ben L.", "Zoe G.", "Alex V.", "Mei L.", "Sam T.",
    "Isabella R.", "Nathan K.", "Grace O.", "Tyler M.", "Nadia S.",
    "Connor B.", "Yuki T.", "Amelia F.", "Jordan P.", "Sofia E.",
]

# ── Post type prompts ─────────────────────────────────────────────────────
POST_TYPES = [
    "substitution tip (e.g. swapped one ingredient for another and why)",
    "technique tip (e.g. a better way to do a specific step)",
    "variation (e.g. added something to make it their own)",
    "serving suggestion (e.g. what to pair it with)",
    "time/temperature tip (e.g. discovered the right doneness)",
    "storage or meal prep tip",
    "honest review mentioning what worked and what to watch out for",
]

REPLY_TYPES = [
    "agreeing and adding a related tip",
    "asking a follow-up question about the original tip",
    "sharing that they tried the tip and how it worked",
    "offering a slight variation on the suggestion",
]

def claude_client():
    return anthropic.Anthropic(api_key=ANTHROPIC_KEY)

def generate_posts(client, recipe_title, ingredients, num_posts, num_replies):
    """Generate forum posts + replies for a recipe using Claude."""
    ing_list = ', '.join(ingredients[:12]) if ingredients else 'various ingredients'
    post_types_sample = random.sample(POST_TYPES, min(num_posts, len(POST_TYPES)))

    prompt = f"""You are generating realistic community forum posts for a cooking app.

Recipe: "{recipe_title}"
Key ingredients: {ing_list}

Generate exactly {num_posts} forum posts from different home cooks sharing tips about this recipe.
Each post should be a different type: {', '.join(post_types_sample)}.

Rules:
- Write in first person, casual tone, like a real home cook
- Each post is 1-3 sentences, specific to THIS recipe
- Be concrete — mention actual ingredients, temperatures, or techniques from the recipe
- Vary the tone: some enthusiastic, some practical, some cautious
- No generic advice — everything must relate directly to the recipe

For each post also generate {num_replies} reply from another cook.

Return ONLY valid JSON in this exact format, no other text:
{{
  "posts": [
    {{
      "author": "name from list or make one up",
      "body": "the tip text",
      "upvotes": <random int 0-24>,
      "replies": [
        {{
          "author": "different name",
          "body": "reply text",
          "upvotes": <random int 0-8>
        }}
      ]
    }}
  ]
}}"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        # Strip any markdown code fences
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        data = json.loads(text)
        return data.get("posts", [])
    except Exception as e:
        print(f"\n  Claude error: {e}")
        return []

def generate_ai_tip(client, recipe_title, ingredients, post_bodies):
    """Generate an AI summary/tip based on the community posts."""
    posts_text = '\n'.join(f'- {b}' for b in post_bodies[:10])
    prompt = f"""You are Savr AI, a cooking assistant.

Recipe: "{recipe_title}"
Ingredients: {', '.join(ingredients[:8])}

Community tips shared about this recipe:
{posts_text}

Write a single AI insight (2-3 sentences) that synthesises the best advice from these tips
and adds one practical suggestion the community hasn't mentioned.
Be specific to this recipe. Start with "Savr AI:" — no other prefix."""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"\n  AI tip error: {e}")
        return None

def seed_recipe(supabase, client, recipe, num_posts, num_replies):
    recipe_id   = recipe['id']
    title       = recipe['title']
    ingredients = recipe.get('ner') or recipe.get('ingredients') or []
    if isinstance(ingredients, str):
        try:    ingredients = json.loads(ingredients)
        except: ingredients = []

    # Check if already seeded (skip if has posts)
    existing = supabase.table('forum_posts') \
        .select('id') \
        .eq('recipe_id', recipe_id) \
        .limit(1) \
        .execute()
    if existing.data:
        return 0  # already seeded

    posts = generate_posts(client, title, ingredients, num_posts, num_replies)
    if not posts:
        return 0

    inserted = 0
    post_bodies = []

    for post in posts:
        body   = str(post.get('body', '')).strip()
        author = str(post.get('author', random.choice(PERSONAS))).strip()[:40]
        if not body:
            continue

        try:
            result = supabase.table('forum_posts').insert({
                'recipe_id':   recipe_id,
                'user_id':     None,
                'seed_author': author,
                'body':        body[:2000],
                'is_ai':       False,
                'upvotes':     int(post.get('upvotes', random.randint(0, 20))),
                'created_at':  f"{random.randint(2023,2024)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}T{random.randint(8,22):02d}:{random.randint(0,59):02d}:00Z",
            }).execute()
            post_id = result.data[0]['id']
            post_bodies.append(body)
            inserted += 1

            # Insert replies
            for reply in post.get('replies', []):
                rbody   = str(reply.get('body', '')).strip()
                rauthor = str(reply.get('author', random.choice(PERSONAS))).strip()[:40]
                if not rbody:
                    continue
                supabase.table('forum_posts').insert({
                    'recipe_id':   recipe_id,
                    'user_id':     None,
                    'seed_author': rauthor,
                    'body':        rbody[:2000],
                    'is_ai':       False,
                    'parent_id':   post_id,
                    'upvotes':     int(reply.get('upvotes', random.randint(0, 8))),
                    'created_at':  f"{random.randint(2023,2024)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}T{random.randint(8,22):02d}:{random.randint(0,59):02d}:00Z",
                }).execute()
                inserted += 1

        except Exception as e:
            print(f"\n  Insert error for recipe {recipe_id}: {e}")
            continue

    # Generate and insert AI tip
    if post_bodies:
        ai_tip = generate_ai_tip(client, title, ingredients, post_bodies)
        if ai_tip:
            try:
                supabase.table('forum_posts').insert({
                    'recipe_id':   recipe_id,
                    'user_id':     None,
                    'seed_author': 'Savr AI',
                    'body':        ai_tip[:2000],
                    'is_ai':       True,
                    'upvotes':     random.randint(5, 30),
                    'created_at':  f"2024-{random.randint(1,12):02d}-{random.randint(1,28):02d}T12:00:00Z",
                }).execute()
                inserted += 1
            except Exception as e:
                print(f"\n  AI tip insert error: {e}")

    return inserted

def main(args):
    print("Connecting to Supabase…")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    client   = claude_client()

    # Fetch recipes to seed
    print(f"Fetching {args.recipes} recipes (offset {args.offset})…")
    result = supabase.table('recipes') \
        .select('id,title,ner,ingredients') \
        .range(args.offset, args.offset + args.recipes - 1) \
        .execute()

    recipes = result.data
    if not recipes:
        print("No recipes found.")
        sys.exit(1)

    print(f"Seeding {len(recipes)} recipes with {args.posts} posts + {args.replies} repl(ies) each…")

    total_inserted = 0
    skipped        = 0

    for recipe in tqdm(recipes, desc="Seeding"):
        n = seed_recipe(supabase, client, recipe, args.posts, args.replies)
        if n == 0:
            skipped += 1
        else:
            total_inserted += n
        # Rate limit — Claude haiku is fast but be courteous
        time.sleep(0.5)

    print(f"\nDone. {total_inserted} posts inserted, {skipped} recipes skipped (already had posts).")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--recipes', type=int, default=50,  help='Number of recipes to seed')
    parser.add_argument('--posts',   type=int, default=4,   help='Posts per recipe')
    parser.add_argument('--replies', type=int, default=1,   help='Replies per post')
    parser.add_argument('--offset',  type=int, default=0,   help='Skip first N recipes')
    main(parser.parse_args())