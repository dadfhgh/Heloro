# HELORO Bot Studio

## Product decision

Lua is the primary bot scripting interface. A visual block editor is a secondary, optional authoring mode for a later increment; it is not included in the first Studio build.

## Language and runtime

- The runtime is Fengari 0.1.5, implementing Lua 5.3 semantics. It is not Roblox Luau and does not provide Roblox services.
- Scripts execute in a fresh server-side Lua state for each incoming bot message.
- Scripts are not evaluated in the browser or in PostgreSQL.
- The base `io`, `os`, `debug`, `package`, `require`, dynamic loaders, garbage collector and coroutine libraries are removed from the Lua global environment.
- The runtime applies a 16,000-byte source limit, a 100,000-instruction budget, at most 12 handlers per event, at most five replies per event, and a 1,000-character limit per reply.
- The script receives only the HELORO `bot` API and the incoming message object. No unrestricted filesystem, network, project secrets, or database client is exposed.

## Supported API

```lua
bot.on("message", function(message)
  if message.text == "/hello" then
    bot.reply(message, "Привет!")
  end
end)

bot.on("command", function(command, message)
  if command == "start" then
    bot.reply(message, "Добро пожаловать!")
  end
end)

bot.log("Скрипт запущен")
```

- `bot.on("message", callback)` receives `message.text`, `message.chat_id` and `message.username`.
- `bot.on("command", callback)` receives a command name (without slash) and the message object.
- `bot.reply(message, text)` emits a reply to the current chat.
- `bot.send_message(chat_id, text)` currently emits a reply to the current chat; arbitrary cross-chat delivery is intentionally unavailable.
- `bot.log(text)` collects a bounded test log.

## Drafts and publishing

- Script drafts and version snapshots are stored in owner-protected `bot_scripts` and `bot_script_versions` tables.
- The `save_bot_script` RPC validates ownership and persists versioned drafts. Publishing snapshots the currently saved source as the active version.
- Published source is returned only through a chat-authorized RPC, not through a public table read.
- With no published Lua script, messages continue to use the pre-existing fixed-command runtime.

## Deployment and verification boundary

The migration and Edge Function in this directory are source artifacts for the Lua Bot Studio task branch. They have not been applied or deployed to the live Supabase project. Therefore saving/publishing and Lua execution require the migration and `run-bot-lua` function to be deployed in a non-production test environment before being considered operational. The UI and client integration are designed to degrade to the existing static command handler when the Edge Function is not deployed.

No Supabase Branching environment was created because its compute cost requires separate approval. The live Supabase project and HELORO Production deployment were not changed by this task.
