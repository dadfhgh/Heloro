import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari as any;
const MAX_SOURCE_BYTES = 16_000;
const MAX_INSTRUCTIONS = 100_000;
const HOOK_INTERVAL = 1_000;
const MAX_REPLIES = 5;
const MAX_REPLY_LENGTH = 1_000;
const MAX_LOGS = 30;
export type LuaResult = { replies: string[]; logs: string[]; instruction_count: number };

function readLuaString(L: unknown, index: number): string {
  const value = lauxlib.luaL_checkstring(L, index);
  return to_jsstring(value);
}

export function executeLua(source: string, input: string, chatId: string): LuaResult {
  if (new TextEncoder().encode(source).length < 1 || new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
    throw new Error("Script must contain 1 to 16000 bytes");
  }

  const L = lauxlib.luaL_newstate();
  const replies: string[] = [];
  const logs: string[] = [];
  const handlers = new Map<string, number[]>();
  let instructions = 0;

  try {
    // Open only pure Lua libraries; package/io/os/debug/coroutines are never initialized.
    // This also avoids environment-based package path resolution inside the Deno runtime.
    const openLibrary = (name: string, opener: (state: unknown) => number) => {
      lauxlib.luaL_requiref(L, to_luastring(name), opener, 1);
      lua.lua_pop(L, 1);
    };
    openLibrary("_G", lualib.luaopen_base);
    openLibrary("table", lualib.luaopen_table);
    openLibrary("string", lualib.luaopen_string);
    openLibrary("math", lualib.luaopen_math);
    openLibrary("utf8", lualib.luaopen_utf8);

    // Base-library loaders and dynamic code compilation are not part of the bot API.
    for (const name of ["dofile", "loadfile", "load", "collectgarbage"]) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, to_luastring(name));
    }
    // A single native-library call must not be able to allocate an enormous string.
    lua.lua_getglobal(L, to_luastring("string"));
    lua.lua_pushnil(L);
    lua.lua_setfield(L, -2, to_luastring("rep"));
    lua.lua_pushnil(L);
    lua.lua_setfield(L, -2, to_luastring("format"));
    lua.lua_pushnil(L);
    lua.lua_setfield(L, -2, to_luastring("dump"));
    lua.lua_pop(L, 1);

    lua.lua_pushcfunction(L, (state: unknown) => {
      const value = lua.lua_gettop(state) > 0 ? lua.lua_tojsstring(state, 1) : "";
      log(String(value));
      return 0;
    });
    lua.lua_setglobal(L, to_luastring("print"));

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
      if ((handlers.get(event)?.length ?? 0) >= 12) {
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
      const targetChatId = readLuaString(state, 1);
      const message = readLuaString(state, 2);
      if (targetChatId !== chatId) {
        return lauxlib.luaL_error(state, to_luastring("Bots can only reply in the current chat."));
      }
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

    // Convert native JavaScript errors raised by runtime guards into normal Lua errors.
    // Fengari provides this bridge for errors thrown across a protected Lua call.
    lua.lua_atnativeerror(L, (state: unknown) => {
      const nativeError = lua.lua_touserdata(state, 1) as unknown;
      const message = nativeError instanceof Error ? nativeError.message : "Lua host callback failed";
      lua.lua_pushstring(state, to_luastring(message));
      return 1;
    });

    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(source));
    if (loadStatus !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(L, -1));
    }

    // Install after parsing so the budget measures executed bytecode only.
    lua.lua_sethook(L, () => {
      instructions += HOOK_INTERVAL;
      if (instructions > MAX_INSTRUCTIONS) {
        throw new Error("Instruction budget exceeded");
      }
    }, lua.LUA_MASKCOUNT, HOOK_INTERVAL);

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
    lua.lua_close(L);
  }
}

