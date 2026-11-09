/*
 * WikiPrev configuration.
 *
 * Fill in the two Supabase values to use the shared database (see README).
 * Both are public by design: the "anon" key only allows what the database's
 * row level security permits, which is nothing until a member signs in.
 * Leave them empty to run in local mode (data stays in this browser).
 */
window.WIKIPREV_CONFIG = {
    supabaseUrl: 'https://ihvumzwnrvvxtzjizdsq.supabase.co',
    supabaseAnonKey: 'sb_publishable_zD0_YWfBX-uMrm6rR_vmjw_pO7c15Fq'   // publishable (public) key
};
