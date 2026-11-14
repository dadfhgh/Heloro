# HELORO Bot Studio

## Product decision

Lua is the primary bot scripting interface. The Studio also has an optional visual rule builder for users who do not want to write Lua by hand. Both modes produce the same Lua source and use the same server-side runtime.

## Editor modes

### Lua editor

- Mobile-friendly code editor with lightweight syntax coloring for Lua keywords, strings, comments, numbers and standard HELORO sandbox APIs.
- Client-side quick checks report source-size limits, unsupported events, event-handler counts and common disabled APIs. These are hints only; they are not a Lua parser or a substitute for the server dry run.
- Snippets and a built-in example library provide reusable greetings, help commands, keyword responses and log handlers. These examples are inserted into the current source; external module loading is intentionally unavailable.
- The test console accepts a sample incoming message and displays replies, logs, execution errors and instruction count.

### Visual rule builder

- Rules support private-chat message events and command events.
- Message conditions: exact match, contains phrase, starts with phrase, or any message.
- Command rules match a command name; every rule defines one reply.
- Generating the blocks creates ordinary Lua 5.3 source. A HELORO_VISUAL_BLOCKS_V1 comment stores the rule data so the visual builder can restore its own rules when the script is reopened.
- Arbitrary hand-written Lua cannot be losslessly converted into visual blocks. Opening the visual builder does not change the current source; only explicitly generating and applying new blocks replaces the editor contents.
- The generated source is still tested by the server runtime before publishing.

## Language and runtime

- The runtime is Fengari 0.1.5, implementing Lua 5.3 semantics. It is not Roblox Luau and does not provide Roblox services.
- Scripts execute in a fresh server-side Lua state for each incoming bot message.
- Scripts are not evaluated in the browser or in PostgreSQL.
- The base libraries io, os, debug, package, require, dynamic loaders, garbage collector and coroutine libraries are removed from the Lua global environment.
- The runtime applies a 16,000-byte source limit, a 100,000-instruction budget, at most 12 handlers per event, at most five replies per event, and a 1,000-character limit per reply.
- The script receives only the HELORO bot API and the incoming message object. No unrestricted filesystem, network, project secrets, or database client is exposed.
- **Important security boundary:** Fengari uses the JavaScript garbage collector; this implementation does not yet enforce a separate per-script memory quota. Instruction and source limits are not a substitute for a hard memory limit. Do not enable untrusted public scripts in production until a bounded-memory runtime/isolated worker and authenticated integration tests are completed.

## Supported API

The current examples use bot.on("message", callback), bot.on("command", callback), bot.reply(message, text), bot.send_message(chat_id, text) and bot.log(text).

- message receives message.text, message.chat_id and message.username.
- command receives a command name without slash and the message object.
- reply emits a reply to the current chat.
- send_message currently emits a reply to the current chat; arbitrary cross-chat delivery is intentionally unavailable.
- log collects a bounded test log.

## Drafts and publishing

- Script drafts and version snapshots are stored in owner-protected bot_scripts and bot_script_versions tables.
- The save_bot_script RPC validates ownership and persists versioned drafts. Publishing snapshots the currently saved source as the active version.
- Published source is returned only through a chat-authorized RPC, not through a public table read.
- The Publish action is enabled only after a successful dry run of the exact current source text. Any source edit invalidates the previous test result.
- The Studio currently lists recent versions but does not yet implement restoring/rolling back an earlier version.
- With no published Lua script, messages continue to use the pre-existing fixed-command runtime.

## Deployment and verification boundary

The migration and Edge Function in this directory are source artifacts for the Lua Bot Studio task branch. They have not been applied or deployed to the live Supabase project. Therefore saving/publishing and live Lua execution require the migration and run-bot-lua function to be deployed in a non-production test environment before being considered operational. The task branch must not be promoted to Production until the runtime memory-safety and authenticated integration-test blockers are resolved.

## Verification status

The original Lua runtime baseline was checked by GitHub Actions run [43476151187](https://github.com/dadfhgh/Heloro/actions/runs/43476151187): Deno type-check passed and Lua sandbox tests passed (5 passed, 0 failed). The later Studio editor and visual builder changes require the updated frontend and runtime workflow to pass before those changes are labelled Tested.

No Supabase Branching environment was created because its compute cost requires separate approval. The live Supabase project and HELORO Production deployment have not been changed by this work.
