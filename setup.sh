#!/bin/bash
# setup.sh
# Creates a Python virtual environment and installs all dependencies
# from requirements.txt.
#
# Usage:
#   chmod +x setup.sh   (first time only — makes the script executable)
#   source setup.sh     (use source, not bash, so the venv activates in your shell)

set -e

echo "Creating virtual environment..."
python3 -m venv .venv

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Installing dependencies from requirements.txt..."
pip install --upgrade pip --quiet
pip install -r requirements.txt

echo ""
echo "Done. Your virtual environment is active."
echo "You can now run the import scripts:"
echo "  python scripts/import.py"
echo "  python scripts/import_nutrition.py"
echo "  python scripts/seed_forum.py"
echo ""
echo "To activate this environment in a new terminal session, run:"
echo "  source .venv/bin/activate"