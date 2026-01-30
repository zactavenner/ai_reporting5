-- Fix RLS policy on clients table to use consistent role targeting
-- The current policy uses 'anon, authenticated' but should use 'public' for consistency

-- Step 1: Drop the existing policy
DROP POLICY IF EXISTS "Public can view clients by token or slug" ON clients;

-- Step 2: Create a new policy with correct role targeting (public = everyone)
CREATE POLICY "Public can view clients by token or slug"
ON clients
FOR SELECT
TO public
USING (
  public_token IS NOT NULL OR slug IS NOT NULL
);