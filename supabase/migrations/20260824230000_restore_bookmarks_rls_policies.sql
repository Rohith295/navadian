/*
  # Restore bookmarks RLS policies

  The bronze_castle migration's dynamic policy-reset loop (`DROP POLICY ...`
  over every table in the public schema) wiped bookmarks' RLS policies as a
  side effect, and never recreated them since bookmarks wasn't in its rebuild
  list. RLS stayed enabled with zero policies, silently denying all reads and
  writes. Restoring the original policies here.
*/

DROP POLICY IF EXISTS "Users can view own bookmarks" ON bookmarks;
DROP POLICY IF EXISTS "Users can insert own bookmarks" ON bookmarks;
DROP POLICY IF EXISTS "Users can update own bookmarks" ON bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON bookmarks;

CREATE POLICY "Users can view own bookmarks" ON bookmarks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own bookmarks" ON bookmarks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own bookmarks" ON bookmarks FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own bookmarks" ON bookmarks FOR DELETE TO authenticated USING (user_id = auth.uid());
