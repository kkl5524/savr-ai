import argparse
import ast
import json
import math
import os
import re
import sys
import pandas as pd
from tqdm import tqdm
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()  # Load environment variables from .env file if present
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

BATCH_SIZE= 100
TABLE= "recipes"

def parse_ner(raw):
    if not raw or pd.isna(raw):
        return []
    try:
        result = ast.literal_eval(raw)
        if isinstance(result, list):
            return [str(x).lower().strip() for x in result if x]
    except Exception:
        pass
    return [x.strip().strip("'\"[]").lower() for x in str(raw).split(",") if x.strip()]

def parse_list_col(raw):
    if not raw or pd.isna(raw):
        return []
    try:
        result = ast.literal_eval(raw)
        if isinstance(result, list):
            return [str(x).strip() for x in result if x]
    except Exception:
        pass
    return [str(raw)]

def infer_tags(ner, title):
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
    if "gluten" in title_l or ("flour" not in ner_set and "bread" not in ner_set):
        pass
    return tags

def main(csv_path):
    print(f"Connecting to Supabase at {SUPABASE_URL[:40]}…")
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"Reading {csv_path}…")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(df):,} rows loaded. Columns: {list(df.columns)}")

    df.columns = [c.lower().strip() for c in df.columns]

    total   = len(df)
    batches = math.ceil(total / BATCH_SIZE)
    errors  = 0

    for i in tqdm(range(batches), desc="Uploading batches"):
        chunk = df.iloc[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        rows  = []

        for _, row in chunk.iterrows():
            ner         = parse_ner(row.get("ner", ""))
            ingredients = parse_list_col(row.get("ingredients", ""))
            directions  = parse_list_col(row.get("directions", ""))
            title       = str(row.get("title", "")).strip()
            if not title or not ner:
                continue

            rows.append({
                "title": title,
                "ingredients": ingredients,
                "directions": directions,
                "ner": ner,
                "source": str(row.get("source", "")).strip() or None,
                "link": str(row.get("link",   "")).strip() or None,
                "tags": infer_tags(ner, title),
            })

        if not rows:
            continue

        try:
            client.table(TABLE).upsert(rows, on_conflict="link").execute()
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"\n  Batch {i} error: {e}")

    print(f"\nDone. {errors} batch error(s).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to recipes CSV file")
    args = parser.parse_args()
    main(args.csv)