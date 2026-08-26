import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) throw new Error('Invalid session');

    const { data: caller } = await adminClient.from('profiles').select('email,role,active').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin' || !caller.active || caller.email.toLowerCase() !== 'info@simplicontax.com') throw new Error('Only info@simplicontax.com can invite team members');

    const { fullName, email, phone, jobTitle, redirectTo } = await request.json();
    if (![fullName, email, phone, jobTitle].every((value) => typeof value === 'string' && value.trim().length > 0)) throw new Error('All team member details are required');
    if (fullName.length > 120 || email.length > 254 || phone.length > 40 || jobTitle.length > 120) throw new Error('One or more team member details are too long');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address');
    const requestOrigin = request.headers.get('origin');
    const safeRedirect = requestOrigin && redirectTo === `${requestOrigin}/portal.html` ? redirectTo : undefined;

    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: safeRedirect,
      data: { full_name: fullName.trim(), phone: phone.trim(), job_title: jobTitle.trim() },
    });
    if (inviteError || !invite.user) throw inviteError ?? new Error('Invitation failed');

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: invite.user.id,
      email: normalizedEmail,
      full_name: fullName.trim(),
      phone: phone.trim(),
      job_title: jobTitle.trim(),
      role: 'team',
      active: true,
    });
    if (profileError) throw profileError;

    const { error: auditError } = await adminClient.from('team_invites').insert({ email: normalizedEmail, full_name: fullName.trim(), phone: phone.trim(), job_title: jobTitle.trim(), invited_by: user.id, auth_user_id: invite.user.id });
    if (auditError) throw auditError;
    return new Response(JSON.stringify({ message: `Invitation sent to ${normalizedEmail}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
