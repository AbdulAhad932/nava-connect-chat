import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: expired } = await supabase
      .from("statuses")
      .select("id, media_url")
      .lt("expires_at", new Date().toISOString());

    let deletedFiles = 0;
    if (expired && expired.length) {
      const paths = expired
        .map((s: any) => s.media_url as string)
        .filter(Boolean);
      if (paths.length) {
        const { error: rmErr } = await supabase.storage
          .from("status-media")
          .remove(paths);
        if (!rmErr) deletedFiles = paths.length;
      }
      await supabase
        .from("statuses")
        .delete()
        .in("id", expired.map((s: any) => s.id));
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: expired?.length ?? 0, deletedFiles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
