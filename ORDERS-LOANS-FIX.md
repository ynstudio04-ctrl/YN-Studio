# Orders + Loans Supabase Fix

This build includes compatibility migrations for older Supabase databases:
- converts legacy BOOLEAN service/upload/loan flags to INTEGER 0/1
- converts legacy DATE/TIMESTAMP order and loan date columns to date-only TEXT
- normalizes admin China/Vietnam order dates before insert/update
- creates loan interest payments with a due date and NULL paid date

The Supabase schema migration runs automatically when the server first connects.
