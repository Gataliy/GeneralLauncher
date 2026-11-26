// Проверка прокси без сети: вызов Gemini подменяется. Запуск: node assistant-proxy/test/worker.test.mjs
import worker from "../worker.js";

const calls = [];
let upstream = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return upstream(init);
};

const env = { GEMINI_API_KEY: "test-key" };
const modelJson = obj => () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
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
r = await post({ message: "hi" }, {}, { GEMINI_API_KEY: "k", APP_TOKEN: "secret" });
check("missing app token -> 401", r.status === 401);
upstream = modelJson({ reply: "ok" });
r = await post({ message: "hi" }, { "x-app-token": "secret" }, { GEMINI_API_KEY: "k", APP_TOKEN: "secret" });
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

// Ответ модели не JSON.
upstream = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "не JSON" }] } }] }), { status: 200 });
data = await (await post({ message: "привет" })).json();
check("broken model JSON -> fallback reply", data.action === null && data.reply.length > 0);

// Ошибка Gemini.
upstream = () => new Response("nope", { status: 403 });
r = await post({ message: "привет" });
check("upstream 403 -> 502", r.status === 502);

// Лимиты, ключ и схема.
calls.length = 0;
upstream = modelJson({ reply: "ok" });
const history = [
  { role: "user", text: "1" }, { role: "model", text: "2" }, { role: "user", text: "3" }, { role: "user", text: "4" },
  { role: "model", text: "5" }, { role: "user", text: "6" }, { role: "model", text: "7" }, { role: "user", text: "8" }
];
await post({ message: "a".repeat(1500), history });
const sent = JSON.parse(calls[0].init.body);
const schemaText = JSON.stringify(sent.generationConfig.responseSchema);
check("message capped at 1000", sent.contents.at(-1).parts[0].text.length === 1000);
check("history capped at 6 + current", sent.contents.length === 7);
check("key sent as header", calls[0].init.headers["x-goog-api-key"] === "test-key");
check("schema lists allowed commands", schemaText.includes("TOGGLE_HEAT_WHEEL") && !schemaText.includes("CAR_OPEN_SUNROOF"));
check("system prompt forbids windows/sunroof", sent.systemInstruction.parts[0].text.includes("окна"));

// Пустое сообщение и чужой путь.
r = await post({ message: "   " });
check("empty message -> 400", r.status === 400);
r = await worker.fetch(new Request("https://proxy.test/other", { method: "POST", body: "{}" }), env);
check("wrong path -> 404", r.status === 404);

globalThis.fetch = realFetch;
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
