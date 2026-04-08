"""
scripts/import_nutrition.py
───────────────────────────
One-time script to load USDA SR Legacy nutrition data into Supabase.

Setup:
  pip install supabase pandas tqdm python-dotenv

Usage:
  python scripts/import_nutrition.py \
    --food food.csv \
    --category food_category.csv \
    --food_nutrient food_nutrient.csv \
    --nutrient nutrient.csv \
    --food_attribute food_attribute.csv

Place all 5 CSVs in the same directory and pass their paths.
"""

import argparse
import os
import time
import pandas as pd
from tqdm import tqdm

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# ── Nutrient IDs we care about ─────────────────────────────────────────────
NUTRIENT_IDS = {
    1008: 'calories',   # Energy (KCAL)
    1003: 'protein',    # Protein (G)
    1004: 'fat',        # Total lipid / fat (G)
    1005: 'carbs',      # Carbohydrate, by difference (G)
    1079: 'fiber',      # Fiber, total dietary (G)
}

# ── Category → dietary tags mapping ───────────────────────────────────────
# Maps food_category_id to tags used in Savr.ai filter chips
CATEGORY_TAGS = {
    1:  ['Vegetarian'],                          # Dairy and Egg Products
    2:  ['Vegan', 'Vegetarian'],                 # Spices and Herbs
    3:  [],                                       # Baby Foods
    4:  ['Vegan', 'Vegetarian'],                 # Fats and Oils
    5:  ['High Protein'],                        # Poultry Products
    6:  [],                                       # Soups, Sauces, Gravies
    7:  ['High Protein'],                        # Sausages and Luncheon Meats
    8:  ['Vegetarian'],                          # Breakfast Cereals
    9:  ['Vegan', 'Vegetarian'],                 # Fruits and Fruit Juices
    10: ['High Protein'],                        # Pork Products
    11: ['Vegan', 'Vegetarian'],                 # Vegetables and Vegetable Products
    12: ['Vegan', 'Vegetarian'],                 # Nut and Seed Products
    13: ['High Protein'],                        # Beef Products
    14: [],                                       # Beverages
    15: ['High Protein'],                        # Finfish and Shellfish Products
    16: ['Vegan', 'Vegetarian', 'High Protein'], # Legumes and Legume Products
    17: ['High Protein'],                        # Lamb, Veal, and Game Products
    18: ['Vegetarian'],                          # Baked Products
    19: ['Vegetarian'],                          # Sweets
    20: ['Vegan', 'Vegetarian'],                 # Cereal Grains and Pasta
    21: [],                                       # Fast Foods
    22: [],                                       # Meals, Entrees, and Side Dishes
    23: [],                                       # Snacks
    24: [],                                       # American Indian/Alaska Native Foods
    25: [],                                       # Restaurant Foods
    26: [],                                       # Branded Food Products
    27: [],                                       # Quality Control
    28: [],                                       # Alcoholic Beverages
}

BATCH_SIZE  = 200
TABLE       = 'nutrition'
MAX_RETRIES = 3

def clean(val):
    """Replace NaN with None for JSON serialisation."""
    if pd.isna(val):
        return None
    return val

def upload_batch(client, rows, batch_num):
    for attempt in range(MAX_RETRIES):
        try:
            client.table(TABLE).insert(rows).execute()
            return True
        except Exception as e:
            err = str(e)
            if '57014' in err:
                wait = 5 * (attempt + 1)
                tqdm.write(f'\n  Batch {batch_num} timeout — retrying in {wait}s…')
                time.sleep(wait)
            else:
                tqdm.write(f'\n  Batch {batch_num} error: {e}')
                return False
    tqdm.write(f'\n  Batch {batch_num} failed after {MAX_RETRIES} attempts — skipping.')
    return False

def main(args):
    print('Connecting to Supabase…')
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Load CSVs ──────────────────────────────────────────────────────────
    print('Reading CSVs…')
    food           = pd.read_csv(args.food)
    food_category  = pd.read_csv(args.category)
    food_nutrient  = pd.read_csv(args.food_nutrient)
    nutrient       = pd.read_csv(args.nutrient)
    food_attribute = pd.read_csv(args.food_attribute)

    print(f'  foods:          {len(food):,}')
    print(f'  food_nutrients: {len(food_nutrient):,}')
    print(f'  food_attribute: {len(food_attribute):,}')

    # ── Filter nutrients to only the 5 we need ─────────────────────────────
    food_nutrient = food_nutrient[
        food_nutrient['nutrient_id'].isin(NUTRIENT_IDS.keys())
    ][['fdc_id', 'nutrient_id', 'amount']]

    # ── Pivot nutrients: one row per fdc_id with columns per nutrient ──────
    print('Pivoting nutrients…')
    pivot = food_nutrient.pivot_table(
        index='fdc_id',
        columns='nutrient_id',
        values='amount',
        aggfunc='first'
    ).reset_index()

    # Rename columns from nutrient_id numbers to friendly names
    pivot.rename(columns={k: v for k, v in NUTRIENT_IDS.items()
                          if k in pivot.columns}, inplace=True)

    # Ensure all nutrient columns exist even if some are missing from data
    for col in NUTRIENT_IDS.values():
        if col not in pivot.columns:
            pivot[col] = None

    # ── Build alternate names from food_attribute (type_id = 1000) ────────
    print('Building alternate names…')
    alt_names = (
        food_attribute[food_attribute['food_attribute_type_id'] == 1000]
        [['fdc_id', 'value']]
        .dropna(subset=['value'])
        .groupby('fdc_id')['value']
        .apply(lambda x: list(x.str.lower().str.strip().unique()))
        .reset_index()
        .rename(columns={'value': 'alternate_names'})
    )

    # ── Merge everything ──────────────────────────────────────────────────
    print('Merging…')
    df = food[['fdc_id', 'description', 'food_category_id']].copy()
    df = df.merge(pivot,     on='fdc_id', how='left')
    df = df.merge(alt_names, on='fdc_id', how='left')

    # Fill missing alternate_names with empty list
    df['alternate_names'] = df['alternate_names'].apply(
        lambda x: x if isinstance(x, list) else []
    )

    # ── Build search_names: description + alternate names, all lowercase ──
    # USDA uses two naming patterns:
    #   1. "Beans, kidney, ..."  → main ingredient first, type after first comma
    #   2. "Kidney beans, ..."   → already in natural order
    # We generate all plausible casual names from both patterns.

    # Qualifiers to strip — preparation methods and states
    STRIP_QUALIFIERS = {
        'raw','cooked','boiled','drained','without salt','with salt',
        'canned','frozen','dried','fresh','mature seeds','sprouted',
        'baby','young','unprepared','prepared','dehydrated','condensed',
        'reduced fat','low fat','nonfat','fat free','whole','skim',
        'light','regular','instant','quick','enriched','unenriched',
        'salted','unsalted','sweetened','unsweetened','plain',
        'all varieties','not reconstituted','reconstituted',
        'ns as to type','ns as to form','ns as to fat content',
    }

    def parse_usda_description(desc):
        """
        Generate casual recipe-friendly names from a USDA food description.
        Examples:
          "Beans, kidney, mature seeds, cooked, boiled" → {"kidney beans", "beans", "kidney"}
          "Onions, raw"                                 → {"onions", "onion"}
          "Oil, olive, salad or cooking"                → {"olive oil", "oil"}
          "Chicken, broilers or fryers, breast"         → {"chicken breast", "chicken"}
        """
        names = set()
        desc  = desc.lower().strip()
        names.add(desc)  # always include full original

        # Split on commas
        parts = [p.strip() for p in desc.split(',')]
        main  = parts[0]
        rest  = parts[1:] if len(parts) > 1 else []

        names.add(main)  # e.g. "beans", "onions", "chicken"

        # Strip trailing 's' for singular form
        if main.endswith('s') and len(main) > 3:
            names.add(main[:-1])

        if rest:
            # First qualifier often gives the type: "kidney", "breast", "olive"
            qualifier = rest[0].strip()

            # Skip pure preparation qualifiers
            if qualifier not in STRIP_QUALIFIERS and len(qualifier) > 1:
                # Natural order: "qualifier main" → "kidney beans", "chicken breast"
                natural = f"{qualifier} {main}"
                names.add(natural)

                # Also try reversed: "main qualifier" → "beans kidney"
                names.add(f"{main} {qualifier}")

                # Singular natural: "kidney bean"
                if main.endswith('s'):
                    names.add(f"{qualifier} {main[:-1]}")

            # Two-qualifier combo: "Beans, kidney, black" → "black kidney beans"
            if len(rest) >= 2:
                q2 = rest[1].strip()
                if q2 not in STRIP_QUALIFIERS and len(q2) > 1:
                    names.add(f"{q2} {qualifier} {main}")
                    names.add(f"{qualifier} {q2} {main}")
                    names.add(f"{q2} {main}")

        # Handle "or" alternatives: "salad or cooking" → keep first
        names = {n.split(' or ')[0].strip() for n in names}

        # Remove empty, very short, or pure-qualifier entries
        names = {
            n for n in names
            if n and len(n) > 1 and n not in STRIP_QUALIFIERS
        }

        return sorted(names)

    def build_search_names(row):
        names = set()
        desc  = str(row['description']).lower().strip()

        # Parse the USDA description
        names.update(parse_usda_description(desc))

        # Add alternate names from food_attribute
        for alt in (row['alternate_names'] or []):
            alt = alt.lower().strip()
            names.add(alt)
            names.update(parse_usda_description(alt))

        # Remove entries that are too long to be useful NER terms (>4 words)
        names = {n for n in names if len(n.split()) <= 4}

        return sorted(names)

    df['search_names'] = df.apply(build_search_names, axis=1)

    # ── Map category to dietary tags ──────────────────────────────────────
    df['tags'] = df['food_category_id'].apply(
        lambda cid: CATEGORY_TAGS.get(int(cid), []) if pd.notna(cid) else []
    )

    print(f'Total nutrition rows to import: {len(df):,}')

    # ── Upload in batches ─────────────────────────────────────────────────
    errors  = 0
    batches = (len(df) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in tqdm(range(batches), desc='Uploading batches'):
        chunk = df.iloc[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        rows  = []

        for _, row in chunk.iterrows():
            rows.append({
                'fdc_id':          int(row['fdc_id']),
                'description':     str(row['description']).strip(),
                'search_names':    row['search_names'],
                'alternate_names': row['alternate_names'],
                'tags':            row['tags'],
                'calories':        clean(row.get('calories')),
                'protein':         clean(row.get('protein')),
                'fat':             clean(row.get('fat')),
                'carbs':           clean(row.get('carbs')),
                'fiber':           clean(row.get('fiber')),
                'food_category_id': int(row['food_category_id']) if pd.notna(row.get('food_category_id')) else None,
            })

        if not rows:
            continue

        success = upload_batch(client, rows, i)
        if not success:
            errors += 1

    print(f'\nDone. {errors} batch error(s) out of {batches} batches.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--food',           required=True)
    parser.add_argument('--category',       required=True)
    parser.add_argument('--food_nutrient',  required=True)
    parser.add_argument('--nutrient',       required=True)
    parser.add_argument('--food_attribute', required=True)
    main(parser.parse_args())