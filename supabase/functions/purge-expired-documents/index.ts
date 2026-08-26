import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };
const retentionDays = 30;
const batchSize = 1000;

type PurgeCandidate = {
  id: string;
  ticket_id: string;
  storage_path: string;
  file_name: string;
  tickets: { closed_at: string; status: string } | Array<{ closed_at: string; status: string }>;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });

  try {
    const suppliedSecret = request.headers.get('x-document-retention-secret');
    const expectedSecret = Deno.env.get('DOCUMENT_RETENTION_SECRET');
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service configuration is missing');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error: queryError } = await adminClient
      .from('ticket_documents')
      .select('id,ticket_id,storage_path,file_name,tickets!inner(closed_at,status)')
      .not('tickets.closed_at', 'is', null)
      .lte('tickets.closed_at', cutoff)
      .in('tickets.status', ['completed', 'complete'])
      .limit(batchSize);
    if (queryError) throw queryError;

    const candidates = (data ?? []) as unknown as PurgeCandidate[];
    if (!candidates.length) {
      return new Response(JSON.stringify({ purged: 0, cutoff }), { status: 200, headers: jsonHeaders });
    }

    const paths = candidates.map((document) => document.storage_path);
    const { error: storageError } = await adminClient.storage.from('ticket-documents').remove(paths);
    if (storageError) throw storageError;

    const auditRows = candidates.map((document) => {
      const ticket = Array.isArray(document.tickets) ? document.tickets[0] : document.tickets;
      return {
        ticket_id: document.ticket_id,
        storage_path: document.storage_path,
        file_name: document.file_name,
        ticket_completed_at: ticket.closed_at,
      };
    });
    const { error: auditError } = await adminClient.from('document_purge_audit').insert(auditRows);
    if (auditError) throw auditError;

    const { error: metadataError } = await adminClient.from('ticket_documents').delete().in('id', candidates.map((document) => document.id));
    if (metadataError) throw metadataError;

    return new Response(JSON.stringify({ purged: candidates.length, cutoff }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: jsonHeaders });
  }
});
