import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ error: "gone", message: "Initial import endpoint disabled" }), { status: 410, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }));
