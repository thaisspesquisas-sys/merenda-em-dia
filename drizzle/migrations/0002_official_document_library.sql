CREATE TABLE public.document_access (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 school_id uuid NOT NULL REFERENCES public.schools(id),
 permission text NOT NULL CHECK (permission IN ('admin_escola','usuario_escola'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_access TO authenticated;
GRANT ALL ON public.document_access TO service_role;
ALTER TABLE public.document_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access own or admin read" ON public.document_access FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "access network admin write" ON public.document_access FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.can_read_documents(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_view_school(s) OR EXISTS (SELECT 1 FROM public.document_access WHERE user_id=auth.uid() AND school_id=s) $$;
CREATE FUNCTION public.can_edit_documents(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_write_school(s) OR EXISTS (SELECT 1 FROM public.document_access WHERE user_id=auth.uid() AND school_id=s) $$;
CREATE FUNCTION public.can_manage_models(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_write_school(s) OR EXISTS (SELECT 1 FROM public.document_access WHERE user_id=auth.uid() AND school_id=s AND permission='admin_escola') $$;
CREATE TABLE public.document_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid REFERENCES public.schools(id),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), category text NOT NULL CHECK (length(category) BETWEEN 1 AND 100),
 archived boolean NOT NULL DEFAULT false, created_by uuid DEFAULT auth.uid(), created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.document_models TO authenticated;
GRANT ALL ON public.document_models TO service_role;
ALTER TABLE public.document_models ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.model_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid NOT NULL REFERENCES public.document_models(id),
 version integer NOT NULL CHECK(version>0), status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','aprovado')),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<5000000),
 source_path text, source_name text, change_note text NOT NULL DEFAULT '', created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(model_id,version)
);
GRANT SELECT, INSERT, UPDATE ON public.model_versions TO authenticated;
GRANT ALL ON public.model_versions TO service_role;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "models readers" ON public.document_models FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR (school_id IS NOT NULL AND public.can_read_documents(school_id)) OR (school_id IS NULL AND EXISTS(SELECT 1 FROM public.model_versions v WHERE v.model_id=id AND v.status='aprovado')));
CREATE POLICY "models create" ON public.document_models FOR INSERT TO authenticated WITH CHECK ((school_id IS NULL AND public.has_role(auth.uid(),'admin')) OR (school_id IS NOT NULL AND public.can_manage_models(school_id)));
CREATE POLICY "models edit" ON public.document_models FOR UPDATE TO authenticated USING ((school_id IS NULL AND public.has_role(auth.uid(),'admin')) OR (school_id IS NOT NULL AND public.can_manage_models(school_id))) WITH CHECK ((school_id IS NULL AND public.has_role(auth.uid(),'admin')) OR (school_id IS NOT NULL AND public.can_manage_models(school_id)));
CREATE FUNCTION public.model_school(m uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT school_id FROM public.document_models WHERE id=m $$;
CREATE FUNCTION public.can_manage_model(m uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.document_models WHERE id=m AND ((school_id IS NULL AND public.has_role(auth.uid(),'admin')) OR (school_id IS NOT NULL AND public.can_manage_models(school_id)))) $$;
CREATE POLICY "versions readers" ON public.model_versions FOR SELECT TO authenticated USING (public.can_manage_model(model_id) OR (status='aprovado' AND (public.model_school(model_id) IS NULL OR public.can_read_documents(public.model_school(model_id)))));
CREATE POLICY "versions create" ON public.model_versions FOR INSERT TO authenticated WITH CHECK(public.can_manage_model(model_id));
CREATE POLICY "versions edit draft" ON public.model_versions FOR UPDATE TO authenticated USING(status='rascunho' AND public.can_manage_model(model_id)) WITH CHECK(public.can_manage_model(model_id));
CREATE TABLE public.model_adoptions (
 school_id uuid NOT NULL REFERENCES public.schools(id), model_id uuid NOT NULL REFERENCES public.document_models(id), version_id uuid NOT NULL REFERENCES public.model_versions(id), PRIMARY KEY(school_id,model_id)
);
GRANT SELECT, INSERT, UPDATE ON public.model_adoptions TO authenticated; GRANT ALL ON public.model_adoptions TO service_role;
ALTER TABLE public.model_adoptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adoptions read" ON public.model_adoptions FOR SELECT TO authenticated USING(public.can_read_documents(school_id));
CREATE POLICY "adoptions write" ON public.model_adoptions FOR ALL TO authenticated USING(public.can_edit_documents(school_id)) WITH CHECK(public.can_edit_documents(school_id) AND EXISTS(SELECT 1 FROM public.model_versions WHERE id=version_id AND model_id=model_adoptions.model_id AND status='aprovado' AND (public.model_school(model_id) IS NULL OR public.model_school(model_id)=model_adoptions.school_id)));
CREATE TABLE public.school_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), category text NOT NULL DEFAULT 'Outros',
 version_id uuid REFERENCES public.model_versions(id), content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<5000000),
 reference_date date, responsible text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.school_documents TO authenticated; GRANT ALL ON public.school_documents TO service_role;
ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents read" ON public.school_documents FOR SELECT TO authenticated USING(public.can_read_documents(school_id));
CREATE POLICY "documents create" ON public.school_documents FOR INSERT TO authenticated WITH CHECK(public.can_edit_documents(school_id) AND (version_id IS NULL OR EXISTS(SELECT 1 FROM public.model_versions WHERE id=version_id AND status='aprovado' AND (public.model_school(model_id) IS NULL OR public.model_school(model_id)=school_documents.school_id))));
CREATE POLICY "documents edit" ON public.school_documents FOR UPDATE TO authenticated USING(public.can_edit_documents(school_id)) WITH CHECK(public.can_edit_documents(school_id));
CREATE TABLE public.document_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id uuid NOT NULL REFERENCES public.school_documents(id), school_id uuid NOT NULL REFERENCES public.schools(id), revision integer NOT NULL, content jsonb NOT NULL, name text NOT NULL, changed_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_revisions TO authenticated; GRANT ALL ON public.document_revisions TO service_role;
ALTER TABLE public.document_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revision read" ON public.document_revisions FOR SELECT TO authenticated USING(public.can_read_documents(school_id));
CREATE FUNCTION public.guard_document_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.school_id<>OLD.school_id OR NEW.version_id IS DISTINCT FROM OLD.version_id THEN RAISE EXCEPTION 'A escola e a versão original não podem ser alteradas'; END IF;
 INSERT INTO public.document_revisions(document_id,school_id,revision,content,name,changed_by) VALUES(OLD.id,OLD.school_id,OLD.revision,OLD.content,OLD.name,auth.uid());
 NEW.revision:=OLD.revision+1; NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER document_update_guard BEFORE UPDATE ON public.school_documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_update();
CREATE FUNCTION public.guard_model_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN RAISE EXCEPTION 'A origem do modelo não pode ser alterada'; END IF; RETURN NEW; END $$;
CREATE TRIGGER model_update_guard BEFORE UPDATE ON public.document_models FOR EACH ROW EXECUTE FUNCTION public.guard_model_update();
CREATE FUNCTION public.guard_version_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF OLD.status='aprovado' OR NEW.model_id<>OLD.model_id OR NEW.version<>OLD.version OR NEW.source_path IS DISTINCT FROM OLD.source_path THEN RAISE EXCEPTION 'Crie uma nova versão para preservar o modelo original'; END IF; RETURN NEW; END $$;
CREATE TRIGGER version_update_guard BEFORE UPDATE ON public.model_versions FOR EACH ROW EXECUTE FUNCTION public.guard_version_update();
CREATE TRIGGER document_audit AFTER INSERT OR UPDATE ON public.school_documents FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER model_audit AFTER INSERT OR UPDATE ON public.document_models FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER version_audit AFTER INSERT OR UPDATE ON public.model_versions FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TABLE public.document_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.school_documents(id), action text NOT NULL CHECK(action IN('export_pdf','export_excel','export_word','print')), user_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.document_events TO authenticated; GRANT ALL ON public.document_events TO service_role;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events read" ON public.document_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.school_documents d WHERE d.id=document_id AND public.can_read_documents(d.school_id)));
CREATE POLICY "events add" ON public.document_events FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.school_documents d WHERE d.id=document_id AND public.can_read_documents(d.school_id)));
CREATE POLICY "originals insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='document-originals' AND public.can_manage_model(((storage.foldername(name))[1])::uuid));
CREATE POLICY "originals read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='document-originals' AND EXISTS(SELECT 1 FROM public.model_versions v WHERE v.source_path=name AND (public.can_manage_model(v.model_id) OR (v.status='aprovado' AND (public.model_school(v.model_id) IS NULL OR public.can_read_documents(public.model_school(v.model_id)))))));
