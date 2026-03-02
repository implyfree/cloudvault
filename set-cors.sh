#!/bin/bash
# Set CORS on all buckets in the project
# Usage: ./set-cors.sh

CORS_FILE="cors.json"

# List of buckets (add your buckets here)
BUCKETS=(
  "#"
)

echo "Setting CORS on buckets..."
for bucket in "${BUCKETS[@]}"; do
  echo "Setting CORS on gs://$bucket"
  gsutil cors set "$CORS_FILE" "gs://$bucket" 2>&1
done

echo ""
echo "Done! Verifying first bucket:"
gsutil cors get "gs://${BUCKETS[0]}"
