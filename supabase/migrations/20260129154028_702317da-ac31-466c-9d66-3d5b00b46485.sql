-- Add aspect_ratio column to store detected dimensions
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS aspect_ratio TEXT;

-- Add comment for clarity
COMMENT ON COLUMN creatives.aspect_ratio IS 'Detected aspect ratio: 1:1, 9:16, 16:9, 4:5, or other';