-- Separate note visibility by sensitivity. These permissions are deliberately
-- unassigned; tenant rights management must grant them explicitly.
INSERT INTO public.permissions(resource, action, description) VALUES
  ('dossiers', 'notes_confidential', 'Vertrouwelijke dossiernotities bekijken en toevoegen'),
  ('dossiers', 'notes_restricted', 'Strikt beperkte dossiernotities bekijken en toevoegen')
ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description;
