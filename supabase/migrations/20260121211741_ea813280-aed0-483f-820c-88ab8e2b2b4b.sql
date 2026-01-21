-- Create csv_import_logs table to track import history
CREATE TABLE public.csv_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL,
  file_name TEXT,
  records_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client_custom_tabs table for custom embed tabs
CREATE TABLE public.client_custom_tabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.csv_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_custom_tabs ENABLE ROW LEVEL SECURITY;

-- RLS policies for csv_import_logs
CREATE POLICY "Public can view csv_import_logs" ON public.csv_import_logs FOR SELECT USING (true);
CREATE POLICY "Public can insert csv_import_logs" ON public.csv_import_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete csv_import_logs" ON public.csv_import_logs FOR DELETE USING (true);

-- RLS policies for client_custom_tabs
CREATE POLICY "Public can view client_custom_tabs" ON public.client_custom_tabs FOR SELECT USING (true);
CREATE POLICY "Public can insert client_custom_tabs" ON public.client_custom_tabs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update client_custom_tabs" ON public.client_custom_tabs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete client_custom_tabs" ON public.client_custom_tabs FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_client_custom_tabs_updated_at
BEFORE UPDATE ON public.client_custom_tabs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();