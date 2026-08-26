import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type TeamAction = 'freeze' | 'unfreeze' | 'remove';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (request.method !== 'POST') throw new Error('Method not allowed');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service configuration is missing');
    if (!authorization) throw new Error('Missing authorization');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) throw new Error('Invalid session');

    const { data: caller, error: callerError } = await adminClient.from('profiles').select('id,email,role,active').eq('id', user.id).single();
    if (callerError || !caller || caller.role !== 'admin' || !caller.active || caller.email.toLowerCase() !== 'info@simplicontax.com') {
      throw new Error('Only info@simplicontax.com can manage Team access');
    }

    const body = await request.json() as { targetUserId?: string; action?: TeamAction };
    if (!body.targetUserId || !body.action || !['freeze', 'unfreeze', 'remove'].includes(body.action)) throw new Error('A valid Team member and action are required');
    if (body.targetUserId === user.id) throw new Error('The administrator cannot change their own access');

    const { data: target, error: targetError } = await adminClient.from('profiles').select('id,email,full_name,role,active,removed_at').eq('id', body.targetUserId).single();
    if (targetError || !target || target.role !== 'team') throw new Error('Team member not found');
    if (target.removed_at && body.action !== 'remove') throw new Error('This Team member has already been removed');

    if (body.action === 'freeze') {
      const { error: banError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
      if (banError) throw banError;
      const { error: profileError } = await adminClient.from('profiles').update({ active: false, frozen_at: new Date().toISOString(), removed_at: null }).eq('id', target.id);
      if (profileError) throw profileError;
    }

    if (body.action === 'unfreeze') {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: 'none' });
      if (unbanError) throw unbanError;
      const { error: profileError } = await adminClient.from('profiles').update({ active: true, frozen_at: null, removed_at: null }).eq('id', target.id);
      if (profileError) throw profileError;
    }

    if (body.action === 'remove') {
      const { error: banError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
      if (banError) throw banError;

      const { data: assignedTickets, error: ticketQueryError } = await adminClient.from('tickets').select('id,ticket_number').eq('assigned_to', target.id);
      if (ticketQueryError) throw ticketQueryError;
      if (assignedTickets?.length) {
        const { error: ticketUpdateError } = await adminClient.from('tickets').update({ assigned_to: caller.id }).eq('assigned_to', target.id);
        if (ticketUpdateError) throw ticketUpdateError;
        const { error: commentError } = await adminClient.from('ticket_comments').insert(assignedTickets.map((ticket) => ({
          ticket_id: ticket.id,
          author_id: caller.id,
          body: `${target.full_name} was removed from the Team. Ticket ${ticket.ticket_number} was returned to the administrator queue.`,
          is_system: true,
        })));
        if (commentError) throw commentError;
      }

      const { error: inviteError } = await adminClient.from('team_invites').update({ auth_user_id: null, status: 'removed' }).eq('auth_user_id', target.id);
      if (inviteError) throw inviteError;
      const { error: profileError } = await adminClient.from('profiles').update({ active: false, frozen_at: null, removed_at: new Date().toISOString() }).eq('id', target.id);
      if (profileError) throw profileError;
    }

    const { error: auditError } = await adminClient.from('user_access_audit').insert({
      target_user_id: target.id,
      target_email: target.email,
      action: body.action,
      performed_by: caller.id,
    });
    if (auditError) throw auditError;

    const labels: Record<TeamAction, string> = { freeze: 'frozen', unfreeze: 'restored', remove: 'removed' };
    return new Response(JSON.stringify({ message: `${target.full_name} has been ${labels[body.action]}.` }), { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: corsHeaders });
  }
});
