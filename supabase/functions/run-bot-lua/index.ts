import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import fengari from "npm:fengari@0.1.5";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari as any;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const MAX_SOURCE_BYTES = 16_000;
const MAX_INSTRUCTIONS = 100_000;
const HOOK_INTERVAL = 1_000;
const MAX_REPLIES = 5;
const MAX_REPLY_LENGTH = 1_000;
const MAX_LOGS = 30;

type LuaResult = { replies: string[]; logs: string[]; instruction_count: number };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readLuaString(L: unknown, index: number): string {
  const value = lauxlib.luaL_checkstring(L, index);
  return to_jsstring(value);
}

function executeLua(source: string, input: string, chatId: string): LuaResult {
  if (new TextEncoder().encode(source).length < 1 || new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
    throw new Error("Script must contain 1 to 16000 bytes");
  }

  const L = lauxlib.luaL_newstate();
  const replies: string[] = [];
  const logs: string[] = [];
  const handlers = new Map<string, number[]>();
  let instructions = 0;

  try {
    lualib.luaL_openlibs(L);

    // Remove libraries and loaders that can access host resources or load other code.
    for (const name of ["io", "os", "debug", "package", "require", "dofile", "loadfile", "load", "collectgarbage", "coroutine"]) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, to_luastring(name));
    }

    const addReply = (value: string) => {
      const clean = value.trim();
      if (!clean) return;
      if (replies.length >= MAX_REPLIES) throw new Error("Reply limit reached");
      if (clean.length > MAX_REPLY_LENGTH) throw new Error("A reply is longer than 1000 characters");
      replies.push(clean);
    };
    const log = (value: string) => {
      if (logs.length < MAX_LOGS) logs.push(value.slice(0, 500));
    };

    lua.lua_createtable(L, 0, 3);
    lua.lua_pushcfunction(L, (state: unknown) => {
      const event = readLuaString(state, 1);
      if (event !== "message" && event !== "command") {
        return lauxlib.luaL_error(state, to_luastring("Unsupported event. Use message or command."));
      }
      if (handlers.get(event)?.length >= 12) {
        return lauxlib.luaL_error(state, to_luastring("Maximum 12 handlers per event."));
      }
      lua.lua_pushvalue(state, 2);
      const reference = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
      handlers.set(event, [...(handlers.get(event) ?? []), reference]);
      return 0;
    });
    lua.lua_setfield(L, -2, to_luastring("on"));

    lua.lua_pushcfunction(L, (state: unknown) => {
      const message = readLuaString(state, 2);
      try { addReply(message); } catch (error) {
        return lauxlib.luaL_error(state, to_luastring(error instanceof Error ? error.message : "Reply rejected"));
      }
      return 0;
    });
    lua.lua_setfield(L, -2, to_luastring("reply"));

    lua.lua_pushcfunction(L, (state: unknown) => {
      const message = readLuaString(state, 2);
      try { addReply(message); } catch (error) {
        return lauxlib.luaL_error(state, to_luastring(error instanceof Error ? error.message : "Reply rejected"));
      }
      return 0;
    });
    lua.lua_setfield(L, -2, to_luastring("send_message"));

    lua.lua_pushcfunction(L, (state: unknown) => {
      const value = lua.lua_gettop(state) > 0 ? lua.lua_tojsstring(state, 1) : "nil";
      log(String(value));
      return 0;
    });
    lua.lua_setfield(L, -2, to_luastring("log"));
    lua.lua_setglobal(L, to_luastring("bot"));

    // The count hook interrupts non-terminating loops through Lua's protected error path.
    lua.lua_sethook(L, (state: unknown) => {
      instructions += HOOK_INTERVAL;
      if (instructions > MAX_INSTRUCTIONS) {
        return lauxlib.luaL_error(state, to_luastring("Instruction budget exceeded"));
      }
      return 0;
    }, lua.LUA_MASKCOUNT, HOOK_INTERVAL);

    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(source));
    if (loadStatus !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(L, -1));
    }
    const runStatus = lua.lua_pcall(L, 0, 0, 0);
    if (runStatus !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(L, -1));
    }

    const messageHandlerRefs = handlers.get("message") ?? [];
    const commandHandlerRefs = handlers.get("command") ?? [];
    const command = input.trim().match(/^\/([a-zA-Z0-9_]+)/)?.[1]?.toLowerCase() ?? null;

    const callHandler = (reference: number, withCommand: boolean) => {
      lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, reference);
      if (withCommand) lua.lua_pushstring(L, to_luastring(command ?? ""));
      lua.lua_createtable(L, 0, 3);
      lua.lua_pushstring(L, to_luastring(input));
      lua.lua_setfield(L, -2, to_luastring("text"));
      lua.lua_pushstring(L, to_luastring(chatId));
      lua.lua_setfield(L, -2, to_luastring("chat_id"));
      lua.lua_pushstring(L, to_luastring("test-user"));
      lua.lua_setfield(L, -2, to_luastring("username"));
      const status = lua.lua_pcall(L, withCommand ? 2 : 1, 0, 0);
      if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    };

    for (const reference of messageHandlerRefs) callHandler(reference, false);
    if (command) {
      for (const reference of commandHandlerRefs) callHandler(reference, true);
    }

    return { replies, logs, instruction_count: Math.min(instructions, MAX_INSTRUCTIONS) };
  } finally {
    lauxlib.luaL_unref?.(L, lua.LUA_REGISTRYINDEX, -1);
    lua.lua_close(L);
  }
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
    body = await request.json();
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
