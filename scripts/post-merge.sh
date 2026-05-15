#!/bin/bash
set -e
bun install --frozen-lockfile
cd lib/db && bun run push