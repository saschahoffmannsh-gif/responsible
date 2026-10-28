#!/bin/bash
# Lokale Function mit In-Memory-DB: http://localhost:8000/responsible
cd "$(dirname "$0")"
export SUPABASE_URL=http://localhost:8813 RS_FAKE_DB=file://$PWD/fake.ts RS_FAKE_VAPID=/tmp/wp/vapid.json RS_FN_URL=http://localhost:8000/responsible
exec deno run -A ../../server/supabase/functions/responsible/index.ts
