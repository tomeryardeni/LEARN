#!/bin/sh
# Builds the standalone page (spec-writing-academy.html) from the source fragment.
set -e
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  cat src/academy.fragment.html
  printf '\n</body>\n</html>\n'
} > spec-writing-academy.html
