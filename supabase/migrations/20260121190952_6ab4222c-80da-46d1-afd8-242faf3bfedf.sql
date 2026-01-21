-- Add slug for friendly public URLs and industry field
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS slug text UNIQUE,
ADD COLUMN IF NOT EXISTS industry text;

-- Create function to generate slug from client name
CREATE OR REPLACE FUNCTION public.generate_client_slug(client_name text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Convert to lowercase, replace spaces and special chars with hyphens
  base_slug := lower(regexp_replace(client_name, '[^a-zA-Z0-9]+', '-', 'g'));
  -- Remove leading/trailing hyphens
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.clients WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update existing clients to have slugs based on their names
UPDATE public.clients 
SET slug = generate_client_slug(name) 
WHERE slug IS NULL;

-- Create trigger to auto-generate slug on insert if not provided
CREATE OR REPLACE FUNCTION public.set_client_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_client_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_client_slug_trigger ON public.clients;
CREATE TRIGGER set_client_slug_trigger
BEFORE INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.set_client_slug();