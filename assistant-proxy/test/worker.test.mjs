// Проверка прокси без сети: вызов Groq подменяется. Запуск: node assistant-proxy/test/worker.test.mjs
import worker from "../worker.js";

const calls = [];
let upstream = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init, model: JSON.parse(init.body).model });
  return upstream(init);
};

const env = { GROQ_API_KEY: "test-key" };
// Ответ Groq в формате chat completions: текст модели лежит в choices[0].message.content.
const modelJson = obj => () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }), { status: 200 });
const post = (body, headers = {}, e = env) => worker.fetch(new Request("https://proxy.test/chat", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body)
}), e);

let failures = 0;
function check(name, ok, extra = "") {
  console.log((ok ? "ok   " : "FAIL ") + name + (extra ? ` (${extra})` : ""));
  if (!ok) failures++;
}

// Ключ не задан.
upstream = modelJson({ reply: "x" });
let r = await worker.fetch(new Request("https://proxy.test/chat", { method: "POST", body: "{}" }), {});
check("no key -> 500", r.status === 500);

// Токен приложения.
r = await post({ message: "hi" }, {}, { GROQ_API_KEY: "k", APP_TOKEN: "secret" });
check("missing app token -> 401", r.status === 401);
upstream = modelJson({ reply: "ok" });
r = await post({ message: "hi" }, { "x-app-token": "secret" }, { GROQ_API_KEY: "k", APP_TOKEN: "secret" });
check("right app token -> 200", r.status === 200);

// Разрешённое действие проходит.
upstream = modelJson({ reply: "Включаю подогрев руля.", action: { name: "climate_command", command: "TOGGLE_HEAT_WHEEL" } });
let data = await (await post({ message: "включи подогрев руля" })).json();
check("allowed climate command passes", data.action?.command === "TOGGLE_HEAT_WHEEL" && data.reply.startsWith("Включаю"));

// Люк, окна, багажник и замки отбрасываются.
upstream = modelJson({ reply: "Открываю люк.", action: { name: "climate_command", command: "CAR_OPEN_SUNROOF" } });
data = await (await post({ message: "открой люк" })).json();
check("sunroof command dropped", data.action === null);
upstream = modelJson({ reply: "Открываю окно.", action: { name: "open_window", command: "open_window_front_left" } });
data = await (await post({ message: "открой окно" })).json();
check("unknown action name dropped", data.action === null);
upstream = modelJson({ reply: "Открываю багажник.", action: { name: "climate_command", command: "profile:open_trunk" } });
data = await (await post({ message: "багажник" })).json();
check("trunk via climate name dropped", data.action === null);

// Событие и задача из чата.
upstream = modelJson({ reply: "Добавлю.", action: { name: "calendar_event", title: "Звонок Ирине", start: "2026-11-28T15:00:00+07:00", location: "Дом" } });
data = await (await post({ message: "событие" })).json();
check("event passes with its place", data.action?.name === "calendar_event" && data.action.start === "2026-11-28T15:00:00+07:00" && data.action.location === "Дом");
upstream = modelJson({ reply: "Добавлю.", action: { name: "calendar_event", title: "Без пояса", start: "2026-11-28T15:00" } });
data = await (await post({ message: "событие" })).json();
check("event without offset gets Tomsk +07:00", data.action?.start === "2026-11-28T15:00+07:00");
upstream = modelJson({ reply: "Во сколько?", action: { name: "calendar_event", title: "Звонок", start: "завтра" } });
data = await (await post({ message: "событие" })).json();
check("event without a time is dropped, reply kept", data.action === null && data.reply === "Во сколько?");
upstream = modelJson({ reply: "Добавлю.", action: { name: "task_add", title: "Полить цветы" } });
data = await (await post({ message: "задача" })).json();
check("task passes", data.action?.name === "task_add" && data.action.title === "Полить цветы");

// Ответ модели не JSON: текст показывается как есть, действия нет.
upstream = () => new Response(JSON.stringify({ choices: [{ message: { content: "Просто текст" } }] }), { status: 200 });
data = await (await post({ message: "привет" })).json();
check("plain text reply shown, no action", data.action === null && data.reply === "Просто текст");

// Основная модель отказала: берётся запасная.
calls.length = 0;
upstream = (init) => JSON.parse(init.body).model === "openai/gpt-oss-120b"
  ? new Response("busy", { status: 429 })
  : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "от запасной", action: null }) } }] }), { status: 200 });
r = await post({ message: "привет" });
data = await r.json();
check("primary 429 -> fallback model answers", r.status === 200 && data.reply === "от запасной", calls.map(c => c.model).join(" > "));

// Обе модели недоступны.
upstream = () => new Response("nope", { status: 503 });
r = await post({ message: "привет" });
check("both models failing -> 502", r.status === 502);

// Запрос к Groq: ключ, JSON-режим, история и лимиты.
calls.length = 0;
upstream = modelJson({ reply: "ok" });
const history = [
  { role: "user", text: "1" }, { role: "model", text: "2" }, { role: "user", text: "3" }, { role: "user", text: "4" },
  { role: "model", text: "5" }, { role: "user", text: "6" }, { role: "model", text: "7" }, { role: "user", text: "8" }
];
await post({ message: "a".repeat(1500), history });
const first = calls[0];
const sent = JSON.parse(first.init.body);
const system = sent.messages[0].content;
check("request goes to Groq chat completions", first.url === "https://api.groq.com/openai/v1/chat/completions", first.url);
check("key sent as bearer token", first.init.headers.authorization === "Bearer test-key");
check("primary model is the dashboard's", sent.model === "openai/gpt-oss-120b", sent.model);
check("JSON mode requested", sent.response_format?.type === "json_object");
check("message capped at 1000", sent.messages.at(-1).content.length === 1000);
check("history capped at 6 turns + system + current", sent.messages.length === 8);
check("history roles mapped to user/assistant", sent.messages[3].role === "assistant" && sent.messages[3].content === "5" && sent.messages[1].role === "user", sent.messages.slice(1, 7).map(m => m.role[0] + m.content).join(" "));
check("system prompt lists allowed commands", system.includes("TOGGLE_HEAT_WHEEL") && !system.includes("CAR_OPEN_SUNROOF"));
check("system prompt forbids windows", system.includes("окна"));
check("system prompt asks for JSON", system.includes("JSON"));
check("system prompt has the Tomsk time", /Сейчас в Томске \(UTC\+7\): \d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(system));

// Пустое сообщение и чужой путь.
r = await post({ message: "   " });
check("empty message -> 400", r.status === 400);
r = await worker.fetch(new Request("https://proxy.test/other", { method: "POST", body: "{}" }), env);
check("wrong path -> 404", r.status === 404);

globalThis.fetch = realFetch;
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
