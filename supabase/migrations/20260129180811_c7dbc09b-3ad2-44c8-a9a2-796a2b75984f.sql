-- Step 1: Drop the incorrectly configured restrictive policy
DROP POLICY IF EXISTS "Public can view clients by token" ON clients;

-- Step 2: Create a proper PERMISSIVE policy for public access
CREATE POLICY "Public can view clients by token or slug"
ON clients
FOR SELECT
TO anon, authenticated
USING (
  public_token IS NOT NULL OR slug IS NOT NULL
);