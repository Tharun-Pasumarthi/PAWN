-- ══════════════════════════════════════════════════════════════
-- PawnVault Multi-Tenant Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ══════════════════════════════════════════════════════════════
-- HOW PHONE LOGIN WORKS:
--   Each shop is a Supabase auth user.
--   Phone number is stored in user_metadata → phone.
--   Login uses mobile number + password (no SMS OTP needed).
--   The app converts: 9876543210 → 9876543210@pawnvault.app internally.
-- ══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- STEP 1 — Find your user UUID
-- Run this query FIRST, copy the ID from the result.
-- ══════════════════════════════════════════════════════════════

SELECT
  id,
  raw_user_meta_data->>'phone'      AS phone,
  raw_user_meta_data->>'shop_name'  AS shop_name,
  email,
  created_at
FROM auth.users
ORDER BY created_at;


-- ══════════════════════════════════════════════════════════════
-- STEP 2 — Update YOUR existing account to store phone metadata
-- Replace the values below with your actual details.
-- ══════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data ||
  jsonb_build_object(
    'phone',     '9848490355',
    'shop_name', 'Dhana Sri Jewellery'
  )
WHERE id = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7';


-- ══════════════════════════════════════════════════════════════
-- STEP 3 — Add user_id columns (safe to re-run)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE pawn_items
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;

ALTER TABLE pawn_history
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;


-- ══════════════════════════════════════════════════════════════
-- STEP 4 — Assign all existing rows to your account
-- ══════════════════════════════════════════════════════════════

UPDATE pawn_items   SET user_id = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7' WHERE user_id IS NULL;
UPDATE pawn_history SET user_id = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7' WHERE user_id IS NULL;

-- Verify no NULLs remain:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pawn_items WHERE user_id IS NULL)
  OR EXISTS (SELECT 1 FROM pawn_history WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Some rows still have NULL user_id. Re-run Step 4.';
  END IF;
  RAISE NOTICE 'All rows assigned. Safe to run Step 5.';
END $$;


-- ══════════════════════════════════════════════════════════════
-- STEP 5 — Enforce NOT NULL, enable RLS, create policies
-- ══════════════════════════════════════════════════════════════

ALTER TABLE pawn_items
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE pawn_history
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE pawn_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_history  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_items_select"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_insert"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_update"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_delete"   ON pawn_items;
DROP POLICY IF EXISTS "shop_history_select" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_insert" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_update" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_delete" ON pawn_history;

CREATE POLICY "shop_items_select"  ON pawn_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "shop_items_insert"  ON pawn_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "shop_items_update"  ON pawn_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "shop_items_delete"  ON pawn_items FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "shop_history_select" ON pawn_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "shop_history_insert" ON pawn_history FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "shop_history_update" ON pawn_history FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "shop_history_delete" ON pawn_history FOR DELETE USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════
-- STEP 6 — Secure RPC function for shop data (replaces insecure view)
-- Only the super user can call this function.
-- ══════════════════════════════════════════════════════════════

-- Drop the insecure view that exposed auth.users
DROP VIEW IF EXISTS public.shops;

-- Create a secure function instead
CREATE OR REPLACE FUNCTION public.get_shops()
RETURNS TABLE (
  user_id uuid,
  phone text,
  shop_name text,
  email varchar,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow super user to call this
  IF auth.uid() IS NULL OR auth.uid() != '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    u.id                                    AS user_id,
    (u.raw_user_meta_data->>'phone')::text  AS phone,
    (u.raw_user_meta_data->>'shop_name')::text AS shop_name,
    u.email,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at;
END;
$$;

-- Revoke from anon, grant only to authenticated
REVOKE ALL ON FUNCTION public.get_shops() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shops() TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- HOW TO ADD A NEW SHOP (run whenever you want to add a shop)
-- Copy this block, fill in the values, and run it.
-- ══════════════════════════════════════════════════════════════

-- SELECT * FROM auth.users
-- WHERE email = '9876543210@pawnvault.app';

-- (Use Supabase Dashboard → Authentication → Users → Add user → Create new user)
--   Email    :  {mobile}@pawnvault.app   e.g. 9876543210@pawnvault.app
--   Password :  any password you choose
--   Then run the UPDATE below to attach phone + shop name metadata:

-- UPDATE auth.users
-- SET raw_user_meta_data = raw_user_meta_data ||
--   jsonb_build_object(
--     'phone',     '9876543210',
--     'shop_name', 'Shop Name Here'
--   )
-- WHERE email = '9876543210@pawnvault.app';


-- ── OPTIONAL: Storage policies for pawn-images bucket ──────
-- Uncomment if your bucket has RLS enabled

-- DROP POLICY IF EXISTS "auth_users_upload"  ON storage.objects;
-- DROP POLICY IF EXISTS "public_read_images" ON storage.objects;
-- CREATE POLICY "auth_users_upload"  ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'pawn-images' AND auth.role() = 'authenticated');
-- CREATE POLICY "public_read_images" ON storage.objects
--   FOR SELECT USING (bucket_id = 'pawn-images');



-- ══════════════════════════════════════════════════════════════
-- STEP 2 — Set your UUID here (replace the placeholder below)
-- Paste your UUID from Step 1 between the single quotes.
-- ══════════════════════════════════════════════════════════════

-- !! REPLACE the value below before running Steps 3-5 !!
DO $$ BEGIN
  IF 'YOUR_USER_UUID_HERE' = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7' THEN
    RAISE EXCEPTION 'Replace YOUR_USER_UUID_HERE with your actual UUID from Step 1 before continuing.';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- STEP 3 — Add user_id columns (safe to re-run)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE pawn_items
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;

ALTER TABLE pawn_history
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;


-- ══════════════════════════════════════════════════════════════
-- STEP 4 — Assign all existing rows to your account
-- Replace YOUR_USER_UUID_HERE with your actual UUID (same as above)
-- ══════════════════════════════════════════════════════════════

UPDATE pawn_items   SET user_id = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7' WHERE user_id IS NULL;
UPDATE pawn_history SET user_id = 'b0b36745-8bb2-44f4-a39d-aab61ff5f4a7' WHERE user_id IS NULL;

-- Verify no NULLs remain before continuing:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pawn_items WHERE user_id IS NULL)
  OR EXISTS (SELECT 1 FROM pawn_history WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Some rows still have NULL user_id. Check that your UUID is correct and re-run Step 4.';
  END IF;
  RAISE NOTICE 'All rows assigned. Safe to run Step 5.';
END $$;


-- ══════════════════════════════════════════════════════════════
-- STEP 5 — Enforce NOT NULL, enable RLS, create policies
-- Only run AFTER Step 4 completes without errors.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE pawn_items
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE pawn_history
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ALTER COLUMN user_id SET NOT NULL;

-- Enable Row Level Security
ALTER TABLE pawn_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_history  ENABLE ROW LEVEL SECURITY;

-- Drop policies if re-running (idempotent)
DROP POLICY IF EXISTS "shop_items_select"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_insert"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_update"   ON pawn_items;
DROP POLICY IF EXISTS "shop_items_delete"   ON pawn_items;
DROP POLICY IF EXISTS "shop_history_select" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_insert" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_update" ON pawn_history;
DROP POLICY IF EXISTS "shop_history_delete" ON pawn_history;

-- Policies for pawn_items
CREATE POLICY "shop_items_select"  ON pawn_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "shop_items_insert"  ON pawn_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "shop_items_update"  ON pawn_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "shop_items_delete"  ON pawn_items FOR DELETE USING (user_id = auth.uid());

-- Policies for pawn_history
CREATE POLICY "shop_history_select" ON pawn_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "shop_history_insert" ON pawn_history FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "shop_history_update" ON pawn_history FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "shop_history_delete" ON pawn_history FOR DELETE USING (user_id = auth.uid());


-- ── OPTIONAL: Storage policies for pawn-images bucket ──────
-- Uncomment if your bucket has RLS enabled

-- DROP POLICY IF EXISTS "auth_users_upload"  ON storage.objects;
-- DROP POLICY IF EXISTS "public_read_images" ON storage.objects;
-- CREATE POLICY "auth_users_upload"  ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'pawn-images' AND auth.role() = 'authenticated');
-- CREATE POLICY "public_read_images" ON storage.objects
--   FOR SELECT USING (bucket_id = 'pawn-images');

-- ════════════════════════════════════════════════════════════════
-- PART 7 — SUPER USER + ITEM TYPE / CUSTOMER NAME
-- Run this in the Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 7A. Add new columns to pawn_items
ALTER TABLE pawn_items ADD COLUMN IF NOT EXISTS item_type text;
ALTER TABLE pawn_items ADD COLUMN IF NOT EXISTS customer_name text;

-- 7B. Add customer_name column to pawn_history
ALTER TABLE pawn_history ADD COLUMN IF NOT EXISTS customer_name text;

-- 7C. Update SELECT policies so super user (8885490355) can view ALL shops' data
-- Super user UUID: 3d2487eb-ee60-4f68-a153-0150b0e90578

DROP POLICY IF EXISTS "shop_items_select" ON pawn_items;
CREATE POLICY "shop_items_select" ON pawn_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

DROP POLICY IF EXISTS "shop_history_select" ON pawn_history;
CREATE POLICY "shop_history_select" ON pawn_history
  FOR SELECT USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );


-- ════════════════════════════════════════════════════════════════
-- PART 9 — ITEM WEIGHT FIELD
-- ════════════════════════════════════════════════════════════════

ALTER TABLE pawn_items ADD COLUMN IF NOT EXISTS weight numeric;


-- ════════════════════════════════════════════════════════════════
-- PART 9B — HISTORY SOURCE LOAN SUMMARY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE pawn_history ADD COLUMN IF NOT EXISTS source_principal numeric;
ALTER TABLE pawn_history ADD COLUMN IF NOT EXISTS source_interest numeric;
ALTER TABLE pawn_history ADD COLUMN IF NOT EXISTS source_total numeric;
ALTER TABLE pawn_history ADD COLUMN IF NOT EXISTS source_shopkeepers text;


-- ════════════════════════════════════════════════════════════════
-- PART 10 — ALLOCATIONS + PART PAYMENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pawn_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES pawn_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users,
  allocated_name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  interest_rate numeric NOT NULL CHECK (interest_rate > 0),
  allocation_date date NOT NULL DEFAULT (now()::date),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  released_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pawn_part_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES pawn_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT (now()::date),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_pawn_allocations_updated_at ON pawn_allocations;
CREATE TRIGGER update_pawn_allocations_updated_at
BEFORE UPDATE ON pawn_allocations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE pawn_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_part_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_allocations_select" ON pawn_allocations;
DROP POLICY IF EXISTS "shop_allocations_insert" ON pawn_allocations;
DROP POLICY IF EXISTS "shop_allocations_update" ON pawn_allocations;
DROP POLICY IF EXISTS "shop_allocations_delete" ON pawn_allocations;

DROP POLICY IF EXISTS "shop_part_payments_select" ON pawn_part_payments;
DROP POLICY IF EXISTS "shop_part_payments_insert" ON pawn_part_payments;
DROP POLICY IF EXISTS "shop_part_payments_update" ON pawn_part_payments;
DROP POLICY IF EXISTS "shop_part_payments_delete" ON pawn_part_payments;

CREATE POLICY "shop_allocations_select" ON pawn_allocations
  FOR SELECT USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_allocations_insert" ON pawn_allocations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_allocations_update" ON pawn_allocations
  FOR UPDATE USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_allocations_delete" ON pawn_allocations
  FOR DELETE USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_part_payments_select" ON pawn_part_payments
  FOR SELECT USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_part_payments_insert" ON pawn_part_payments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_part_payments_update" ON pawn_part_payments
  FOR UPDATE USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );

CREATE POLICY "shop_part_payments_delete" ON pawn_part_payments
  FOR DELETE USING (
    user_id = auth.uid()
    OR auth.uid() = '3d2487eb-ee60-4f68-a153-0150b0e90578'::uuid
  );


-- ══════════════════════════════════════════════════════════════
-- PART 8 — Fix mutable search_path on update_updated_at_column
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;