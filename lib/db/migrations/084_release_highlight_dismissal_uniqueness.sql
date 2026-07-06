-- Release highlight dismissal hardening.
-- A highlight can be dismissed once per authenticated user.

CREATE UNIQUE INDEX IF NOT EXISTS release_dismissals_highlight_user_unique_idx
  ON release_dismissals(highlight_id, user_id)
  WHERE user_id IS NOT NULL;
