-- Add mediator columns to pawn_items table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

ALTER TABLE pawn_items
ADD COLUMN IF NOT EXISTS mediator text,
ADD COLUMN IF NOT EXISTS mediator_name text;

-- Optional: Add index for serial number prefix lookups
CREATE INDEX IF NOT EXISTS idx_pawn_items_serial_prefix
ON pawn_items (serial_number text_pattern_ops);
