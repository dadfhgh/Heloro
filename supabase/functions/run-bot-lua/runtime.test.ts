import { executeLua } from "./runtime.ts";

Deno.test("runs a message handler and collects a reply", () => {
  const result = executeLua(
    'bot.on("message", function(message) if message.text == "/hello" then bot.reply(message, "Привет!") end end)',
    "/hello",
    "test-chat",
  );
  if (result.replies.length !== 1 || result.replies[0] !== "Привет!") {
    throw new Error("Expected exactly one greeting reply");
  }
});

Deno.test("passes command names to command handlers", () => {
  const result = executeLua(
    'bot.on("command", function(command, message) if command == "start" then bot.reply(message, "Ready") end end)',
    "/start",
    "test-chat",
  );
  if (result.replies[0] !== "Ready") throw new Error("Command handler was not called");
});

Deno.test("blocks access to host libraries", () => {
  let failed = false;
  try {
    executeLua('bot.on("message", function() io.open("blocked.txt") end)', "hello", "test-chat");
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected the io library to be unavailable");
});

Deno.test("stops scripts that exceed the instruction budget", () => {
  let failed = false;
  try {
    executeLua("while true do end", "hello", "test-chat");
  } catch (error) {
    failed = error instanceof Error && /Instruction budget exceeded/.test(error.message);
  }
  if (!failed) throw new Error("Expected the instruction budget to stop the loop");
});

Deno.test("does not allow a script to send to another chat", () => {
  let failed = false;
  try {
    executeLua(
      'bot.on("message", function(message) bot.send_message("different-chat", "no") end)',
      "hello",
      "test-chat",
    );
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected cross-chat delivery to be rejected");
});
