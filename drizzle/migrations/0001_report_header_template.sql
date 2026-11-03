CREATE TABLE public.report_header_template (
 id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
 image_data text NOT NULL CHECK (length(image_data) <= 2800000 AND image_data ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'),
 source_name text NOT NULL CHECK (length(source_name) BETWEEN 1 AND 255),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_header_template TO authenticated;
GRANT ALL ON public.report_header_template TO service_role;
ALTER TABLE public.report_header_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "header readers" ON public.report_header_template FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'estoquista') OR public.has_role(auth.uid(), 'diretor'));
CREATE POLICY "header admin writers" ON public.report_header_template FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
