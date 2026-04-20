"""
scripts/import.py
─────────────────
One-time script to load the Kaggle recipe dataset into Supabase.

Setup:
  pip install supabase pandas tqdm

Usage:
  python scripts/import.py --csv path/to/recipes.csv

The CSV columns expected (from the Kaggle dataset):
  title, ingredients, directions, link, source, NER

The NER column contains clean ingredient names as a Python-literal list string,
e.g.  "['garlic', 'olive oil', 'chicken']"
We parse it into a Postgres text[] array for fast ingredient matching.
"""

import argparse
import ast
import json
import os
import re
import sys
import time
import pandas as pd
from tqdm import tqdm
from supabase import create_client

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads .env file if present, silently skips if not
except ImportError:
    pass  # python-dotenv not installed — rely on shell env vars

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Smaller batch size reduces timeout risk and per-request payload size
BATCH_SIZE   = 100
TABLE        = "recipes"
MAX_RETRIES  = 3
RETRY_DELAY  = 5  # seconds between retries

def clean_string(s):
    """
    Remove null bytes and other characters Postgres cannot store as text.
    The \\u0000 error (code 22P05) is caused by null bytes in the raw CSV.
    """
    if not isinstance(s, str):
        return s
    # Remove null bytes
    s = s.replace('\x00', '')
    # Remove other non-printable control characters except newline/tab
    s = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)
    return s

def clean_list(lst):
    """Apply clean_string to every element of a list."""
    return [clean_string(x) for x in lst if x]

def parse_ner(raw):
    """Parse NER column — stored as a Python list literal string."""
    if not raw or pd.isna(raw):
        return []
    raw = clean_string(str(raw))
    try:
        result = ast.literal_eval(raw)
        if isinstance(result, list):
            return [clean_string(str(x)).lower().strip() for x in result if x]
    except Exception:
        pass
    return [clean_string(x.strip().strip("'\"[]")).lower() for x in str(raw).split(",") if x.strip()]

def parse_list_col(raw):
    """Parse ingredients / directions columns — also stored as list literals."""
    if not raw or pd.isna(raw):
        return []
    raw = clean_string(str(raw))
    try:
        result = ast.literal_eval(raw)
        if isinstance(result, list):
            return clean_list([str(x).strip() for x in result if x])
    except Exception:
        pass
    return [clean_string(str(raw))]

def infer_tags(ner, title):
    """Derive simple dietary tags from NER and title."""
    tags = []
    ner_set = set(ner)
    title_l = title.lower()
    meat    = {"chicken","beef","pork","lamb","turkey","bacon","ham","sausage",
               "salmon","tuna","shrimp","fish","seafood","anchovy","anchovies"}
    dairy   = {"milk","cheese","butter","cream","yogurt","yoghurt","parmesan",
               "mozzarella","cheddar","ricotta"}
    if not (ner_set & meat) and not (ner_set & dairy):
        tags.append("Vegan")
    elif not (ner_set & meat):
        tags.append("Vegetarian")
    if ner_set & meat - {"salmon","tuna","shrimp","fish","seafood","anchovy","anchovies"}:
        tags.append("High Protein")
    return tags

def upload_batch(client, rows, batch_num):
    """
    Upload a batch with retries.
    Handles statement timeouts (57014) by waiting and retrying.
    """
    for attempt in range(MAX_RETRIES):
        try:
            client.table(TABLE).insert(rows).execute()
            return True
        except Exception as e:
            err = str(e)
            if '57014' in err:
                # Statement timeout — wait longer before retrying
                wait = RETRY_DELAY * (attempt + 1)
                tqdm.write(f"\n  Batch {batch_num} timeout (attempt {attempt+1}/{MAX_RETRIES}) — retrying in {wait}s…")
                time.sleep(wait)
            elif '22P05' in err or 'unicode' in err.lower() or 'null' in err.lower():
                # Null byte / bad unicode — try stripping more aggressively
                tqdm.write(f"\n  Batch {batch_num} unicode error — sanitising and retrying…")
                rows = [{k: clean_string(v) if isinstance(v, str) else v
                         for k, v in row.items()} for row in rows]
                time.sleep(1)
            else:
                tqdm.write(f"\n  Batch {batch_num} error: {e}")
                return False
    tqdm.write(f"\n  Batch {batch_num} failed after {MAX_RETRIES} attempts — skipping.")
    return False

def main(csv_path):
    print(f"Connecting to Supabase at {SUPABASE_URL[:40]}…")
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Count rows first for the progress bar without loading the full file
    print(f"Counting rows in {csv_path}…")
    total = sum(1 for _ in open(csv_path, encoding="utf-8", errors="replace")) - 1
    print(f"  {total:,} rows found.")

    errors  = 0
    batches = 0
    rows    = []

    # Stream the CSV in chunks — avoids loading 2GB into memory at once
    CSV_CHUNK = 500  # rows read from disk at a time
    reader = pd.read_csv(
        csv_path,
        chunksize=CSV_CHUNK,
        low_memory=True,
        on_bad_lines="skip",
    )

    with tqdm(total=total, desc="Processing rows", unit="row") as pbar:
        for chunk in reader:
            chunk.columns = [c.lower().strip() for c in chunk.columns]

            for _, row in chunk.iterrows():
                ner         = parse_ner(row.get("ner", ""))
                ingredients = parse_list_col(row.get("ingredients", ""))
                directions  = parse_list_col(row.get("directions", ""))
                title       = clean_string(str(row.get("title", "")).strip())
                source      = clean_string(str(row.get("source", "")).strip()) or None
                link        = clean_string(str(row.get("link",   "")).strip()) or None

                if not title or not ner:
                    pbar.update(1)
                    continue

                rows.append({
                    "title":       title,
                    "ingredients": ingredients,
                    "directions":  directions,
                    "ner":         ner,
                    "source":      source,
                    "link":        link,
                    "tags":        infer_tags(ner, title),
                })

                # Upload in BATCH_SIZE chunks
                if len(rows) >= BATCH_SIZE:
                    success = upload_batch(client, rows, batches)
                    if not success:
                        errors += 1
                    batches += 1
                    rows = []

                pbar.update(1)

        # Upload any remaining rows
        if rows:
            success = upload_batch(client, rows, batches)
            if not success:
                errors += 1
            batches += 1

    print(f"\nDone. {errors} batch error(s) out of {batches} batches.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to recipes CSV file")
    args = parser.parse_args()
    main(args.csv)
