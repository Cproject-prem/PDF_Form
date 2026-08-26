#!/bin/bash
# Git Push / Upload Utility for PDF Form

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "==================================================="
echo "     Git Push / Upload Utility (PDF Form)"
echo "==================================================="
echo ""

read -p "Enter commit message (Leave empty for default timestamp): " MSG
if [ -z "$MSG" ]; then
    MSG="Update PDF Form - $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "---> Pushing PDF Form..."
cd "$SCRIPT_DIR" || exit 1
git add .
git commit -m "$MSG"
git push origin main

echo ""
echo "==================================================="
echo "Git Push completed!"
echo "==================================================="
