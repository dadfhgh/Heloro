import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { executeLua } from "./runtime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !publishableKey) {
    return json({ error: "Missing user session or Supabase public configuration" }, 401);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 24_000) {
      return json({ error: "Request is too large" }, 413);
    }
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON request" }, 400);
  }
  const action = body.action;
  if (action === "test") {
    const botId = String(body.bot_id ?? "");
    const source = String(body.source_code ?? "");
    const testMessage = String(body.test_message ?? "/hello").slice(0, 1000);
    const { data: ownedBot, error: ownerError } = await supabase
      .from("bots").select("id").eq("id", botId).eq("owner_id", authData.user.id).maybeSingle();
    if (ownerError || !ownedBot) return json({ error: "Bot not found or you are not its owner" }, 403);
    try {
      const result = executeLua(source, testMessage, "test-chat");
      return json({ ok: true, ...result });
    } catch (error) {
      return json({
        ok: false,
        replies: [],
        logs: [],
        error: error instanceof Error ? error.message.slice(0, 500) : "Lua execution failed",
      });
    }
  }

  if (action === "run") {
    const chatId = String(body.chat_id ?? "");
    const message = String(body.message ?? "");
    if (!chatId || message.length < 1 || message.length > 4000) {
      return json({ error: "A chat ID and a 1 to 4000 character message are required" }, 400);
    }

    const { data: preparedData, error: prepareError } = await supabase.rpc("prepare_bot_lua_message", {
      p_chat_id: chatId,
      p_body: message,
    });
    if (prepareError) return json({ error: prepareError.message }, 400);
    const prepared = Array.isArray(preparedData) ? preparedData[0] : preparedData;
    if (!prepared || prepared.use_legacy) {
      const { error: legacyError } = await supabase.rpc("send_bot_message", {
        p_chat_id: chatId,
        p_body: message,
      });
      if (legacyError) return json({ error: legacyError.message }, 400);
      return json({ ok: true, legacy: true });
    }

    let replies: string[] = [];
    let runtimeError = "";
    try {
      const result = executeLua(String(prepared.source_code ?? ""), message, chatId);
      replies = result.replies;
    } catch (error) {
      runtimeError = error instanceof Error ? error.message.slice(0, 500) : "Lua execution failed";
      replies = ["Извините, бот временно недоступен. Владелец бота может проверить скрипт в Lua Bot Studio."];
    }

    const { error: finishError } = await supabase.rpc("finish_bot_lua_message", {
      p_chat_id: chatId,
      p_user_message_id: prepared.user_message_id,
      p_replies: replies,
    });
    if (finishError) return json({ error: finishError.message }, 400);
    return json({ ok: true, runtime_error: runtimeError || undefined });
  }

  return json({ error: "Unknown action" }, 400);
});
