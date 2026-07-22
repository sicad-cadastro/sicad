// Edge Function: consultar-sinesp
// Substitui os proxies CORS públicos (corsproxy.io, allorigins.win) por um proxy
// próprio no Supabase — auditável, sem terceiros vendo as placas consultadas.
//
// COMO DEPLOYAR:
//   1. Instala Supabase CLI: npm i -g supabase
//   2. Login: supabase login
//   3. Link do projeto: supabase link --project-ref vkrkirientpljlxstafm
//   4. Deploy: supabase functions deploy consultar-sinesp
//
// Após deploy, a URL fica:
//   https://vkrkirientpljlxstafm.supabase.co/functions/v1/consultar-sinesp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const placa = String(body?.placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (placa.length !== 7) {
      return new Response(
        JSON.stringify({ erro: "Placa inválida — precisa ter 7 caracteres alfanuméricos" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Consulta oficial SINESP Cidadão
    const url = `https://sinespcidadao.sinesp.gov.br/sinesp-cidadao/api/v1/placas/${placa}`;
    const r = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "SICAD/1.0" },
    });

    const raw = await r.text();
    return new Response(raw, {
      status: r.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ erro: "Falha interna", detalhes: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
