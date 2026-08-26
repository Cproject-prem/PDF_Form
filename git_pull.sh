#!/bin/bash
# Git Pull / Sync Utility for PDF Form

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "==================================================="
echo "       Git Pull / Sync Utility (PDF Form)"
echo "==================================================="
echo ""
echo "---> Pulling PDF Form..."
cd "$SCRIPT_DIR" || exit 1
git pull origin main

echo ""
echo "==================================================="
echo "Git Pull completed!"
echo "==================================================="
