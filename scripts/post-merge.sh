#!/bin/bash
set -e

# Install / sync workspace dependencies
pnpm install --frozen-lockfile

# NOTE: DB migrations cannot run here — Supabase TCP (port 5432/6543) is blocked
# in the Replit sandbox. Schema changes must be applied manually via the Supabase
# SQL Editor. See .agents/memory/supabase-tcp.md for context.
