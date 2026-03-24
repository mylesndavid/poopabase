/**
 * AI Chat Server — dogfooding poopabase as the database.
 *
 * Uses poopabase for:
 * 1. Regular SQL (conversations, messages) — like Neon/Supabase
 * 2. Document search (FTS5) — agent searches uploaded docs
 * 3. Memory — agent remembers things across conversations
 *
 * HTTP API:
 *   POST /chat              — send message, get AI response
 *   POST /conversations     — create conversation
 *   GET  /conversations     — list conversations
 *   GET  /conversations/:id — get messages
 *   POST /docs/ingest       — upload a document
 *   POST /docs/search       — search documents
 *   GET  /health            — health check
 */

import { createClient, type Client } from "@libsql/client";
import http from "node:http";

const DB_PATH = "./chat.poop.db";
const PORT = Number(process.env.PORT || 4200);
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const db: Client = createClient({ url: `file:${DB_PATH}` });

// ============================
// Helpers
// ============================

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

function sanitizeFts(query: string): string {
  const stops = new Set(["a","an","the","is","are","how","what","when","where","why","who","that","this","it","in","on","at","to","for","of","with","and","or","not","do","does"]);
  const words = query.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !stops.has(w.toLowerCase()));
  return words.length ? words.map(w => `"${w}"`).join(" OR ") : query.replace(/[^\w\s]/g, "");
}

// ============================
// Document search
// ============================

async function searchDocs(query: string, limit = 5): Promise<string> {
  const ftsQuery = sanitizeFts(query);
  if (!ftsQuery) return "";

  try {
    const results = await db.execute({
      sql: `SELECT c.content, c.section, d.source
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.rowid
            JOIN documents d ON d.id = c.document_id
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
      args: [ftsQuery, limit],
    });

    if (results.rows.length === 0) return "";

    return results.rows
      .map((r: any) => `[Source: ${r.source}${r.section ? ` > ${r.section}` : ""}]\n${r.content}`)
      .join("\n\n---\n\n");
  } catch {
    return "";
  }
}

// ============================
// Memory
// ============================

async function recallMemories(query: string, limit = 3): Promise<string> {
  const ftsQuery = sanitizeFts(query);
  if (!ftsQuery) return "";

  try {
    const obs = await db.execute({
      sql: `SELECT o.content FROM observations_fts
            JOIN observations o ON o.id = observations_fts.rowid
            WHERE observations_fts MATCH ? ORDER BY rank LIMIT ?`,
      args: [ftsQuery, limit],
    });

    const mems = await db.execute({
      sql: `SELECT m.content FROM memories_fts
            JOIN memories m ON m.id = memories_fts.rowid
            WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`,
      args: [ftsQuery, limit],
    });

    const all = [
      ...mems.rows.map((r: any) => `[Memory] ${r.content}`),
      ...obs.rows.map((r: any) => `[Observation] ${r.content}`),
    ];

    return all.length > 0 ? all.join("\n") : "";
  } catch {
    return "";
  }
}

async function storeObservation(content: string) {
  await db.execute({
    sql: "INSERT INTO observations (content) VALUES (?)",
    args: [content],
  });
}

// ============================
// AI Chat
// ============================

async function chat(
  conversationId: number,
  userMessage: string
): Promise<string> {
  // Save user message
  await db.execute({
    sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
    args: [conversationId, userMessage],
  });

  // Search docs for relevant context
  const docContext = await searchDocs(userMessage);

  // Recall relevant memories
  const memoryContext = await recallMemories(userMessage);

  // Get conversation history (last 20 messages)
  const history = await db.execute({
    sql: "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20",
    args: [conversationId],
  });
  const historyMessages = history.rows
    .reverse()
    .map((r: any) => ({ role: r.role, content: r.content }));

  // Build system prompt
  let systemPrompt = `You are a helpful AI assistant. You have access to a document knowledge base and a memory system.`;

  if (docContext) {
    systemPrompt += `\n\nRelevant documents found:\n${docContext}`;
  }

  if (memoryContext) {
    systemPrompt += `\n\nRelevant memories:\n${memoryContext}`;
  }

  systemPrompt += `\n\nAfter responding, if the user shares any preferences, facts, or important information, I will remember it for future conversations.`;

  // Call LLM (OpenAI-compatible API)
  let assistantResponse: string;

  if (OPENAI_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
          ],
          max_tokens: 1000,
        }),
      });

      const data = await response.json() as any;
      if (data.error) {
        assistantResponse = `LLM Error: ${data.error.message}`;
      } else {
        assistantResponse = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
      }
    } catch (err) {
      assistantResponse = `Error calling LLM: ${err}`;
    }
  } else {
    assistantResponse = "No OPENAI_API_KEY set. Set it to enable AI responses.\n\nBut here's what I found:\n\n";
    if (docContext) {
      assistantResponse += `📄 Document context:\n${docContext.slice(0, 500)}\n\n`;
    }
    if (memoryContext) {
      assistantResponse += `🧠 Memories:\n${memoryContext}\n\n`;
    }
    if (!docContext && !memoryContext) {
      assistantResponse += "Upload some documents first, then ask questions about them.";
    }
  }

  // Save assistant message
  await db.execute({
    sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
    args: [conversationId, assistantResponse],
  });

  // Store observation about this interaction
  if (userMessage.length > 20) {
    await storeObservation(`User asked about: ${userMessage.slice(0, 100)}`);
  }

  // Update conversation timestamp
  await db.execute({
    sql: "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
    args: [conversationId],
  });

  return assistantResponse;
}

// ============================
// Document ingestion (chunking + FTS)
// ============================

async function ingestDocument(content: string, source: string, title?: string) {
  const docResult = await db.execute({
    sql: "INSERT INTO documents (source, title, type, content) VALUES (?, ?, 'markdown', ?)",
    args: [source, title || source, content],
  });
  const docId = Number(docResult.lastInsertRowid);

  // Structure-aware chunking
  const sections = content.split(/(?=^#{1,3}\s)/m);
  let chunkIndex = 0;

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(/^#{1,3}\s+(.+)/)?.[1] || null;

    // Split long sections into paragraphs
    if (trimmed.length > 800) {
      const paragraphs = trimmed.split(/\n\n+/);
      for (const para of paragraphs) {
        if (para.trim().length < 20) continue;
        await db.execute({
          sql: "INSERT INTO chunks (document_id, content, section, chunk_index) VALUES (?, ?, ?, ?)",
          args: [docId, para.trim(), heading, chunkIndex++],
        });
      }
    } else {
      await db.execute({
        sql: "INSERT INTO chunks (document_id, content, section, chunk_index) VALUES (?, ?, ?, ?)",
        args: [docId, trimmed, heading, chunkIndex++],
      });
    }
  }

  return { docId, chunks: chunkIndex };
}

// ============================
// HTTP Server
// ============================

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // Health
    if (pathname === "/health") {
      const docs = await db.execute("SELECT COUNT(*) as c FROM documents");
      const msgs = await db.execute("SELECT COUNT(*) as c FROM messages");
      const obs = await db.execute("SELECT COUNT(*) as c FROM observations");
      json(res, {
        status: "ok",
        database: DB_PATH,
        documents: (docs.rows[0] as any).c,
        messages: (msgs.rows[0] as any).c,
        observations: (obs.rows[0] as any).c,
      });
      return;
    }

    // Create conversation
    if (pathname === "/conversations" && req.method === "POST") {
      const body = await readBody(req);
      const result = await db.execute({
        sql: "INSERT INTO conversations (title) VALUES (?)",
        args: [body.title || "New Conversation"],
      });
      json(res, { id: Number(result.lastInsertRowid), title: body.title || "New Conversation" });
      return;
    }

    // List conversations
    if (pathname === "/conversations" && req.method === "GET") {
      const result = await db.execute(
        "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50"
      );
      json(res, { conversations: result.rows });
      return;
    }

    // Get conversation messages
    const convMatch = pathname.match(/^\/conversations\/(\d+)$/);
    if (convMatch && req.method === "GET") {
      const result = await db.execute({
        sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        args: [Number(convMatch[1])],
      });
      json(res, { messages: result.rows });
      return;
    }

    // Chat
    if (pathname === "/chat" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.message) {
        json(res, { error: "Missing 'message'" }, 400);
        return;
      }

      let convId = body.conversation_id;
      if (!convId) {
        const result = await db.execute({
          sql: "INSERT INTO conversations (title) VALUES (?)",
          args: [body.message.slice(0, 50)],
        });
        convId = Number(result.lastInsertRowid);
      }

      const response = await chat(convId, body.message);
      json(res, { conversation_id: convId, response });
      return;
    }

    // Ingest document
    if (pathname === "/docs/ingest" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.content || !body.source) {
        json(res, { error: "Missing 'content' or 'source'" }, 400);
        return;
      }
      const result = await ingestDocument(body.content, body.source, body.title);
      json(res, { ...result, message: `Ingested ${result.chunks} chunks` });
      return;
    }

    // Search docs
    if (pathname === "/docs/search" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.query) {
        json(res, { error: "Missing 'query'" }, 400);
        return;
      }
      const context = await searchDocs(body.query, body.limit || 10);
      json(res, { results: context });
      return;
    }

    // Serve the chat UI
    if (pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(CHAT_HTML);
      return;
    }

    json(res, { error: "Not found" }, 404);
  } catch (err: any) {
    json(res, { error: err.message }, 500);
  }
});

// ============================
// Chat UI (inline HTML)
// ============================

const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>poopabase AI Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; }
    .header { padding: 16px 24px; border-bottom: 1px solid #1e1e1e; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 16px; font-weight: 600; }
    .header .badge { font-size: 11px; background: #22c55e20; color: #22c55e; padding: 2px 8px; border-radius: 9999px; }
    .main { flex: 1; display: flex; overflow: hidden; }
    .sidebar { width: 280px; border-right: 1px solid #1e1e1e; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .sidebar h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #737373; margin-bottom: 4px; }
    .sidebar button { background: #141414; border: 1px solid #1e1e1e; color: #e5e5e5; padding: 10px 12px; border-radius: 8px; cursor: pointer; text-align: left; font-size: 13px; transition: background 0.15s; }
    .sidebar button:hover { background: #1e1e1e; }
    .sidebar .upload-area { border: 1px dashed #333; border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; color: #737373; font-size: 12px; transition: border-color 0.15s; }
    .sidebar .upload-area:hover { border-color: #22c55e; color: #22c55e; }
    .chat-area { flex: 1; display: flex; flex-direction: column; }
    .messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .message { max-width: 720px; line-height: 1.6; }
    .message.user { align-self: flex-end; background: #1a2e1a; border: 1px solid #22c55e30; padding: 12px 16px; border-radius: 16px 16px 4px 16px; }
    .message.assistant { align-self: flex-start; background: #141414; border: 1px solid #1e1e1e; padding: 12px 16px; border-radius: 16px 16px 16px 4px; }
    .message.system { align-self: center; color: #737373; font-size: 12px; font-style: italic; }
    .message pre { background: #0a0a0a; padding: 8px 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; font-size: 12px; }
    .message code { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    .input-area { padding: 16px 24px; border-top: 1px solid #1e1e1e; display: flex; gap: 8px; }
    .input-area input { flex: 1; background: #141414; border: 1px solid #1e1e1e; color: #e5e5e5; padding: 12px 16px; border-radius: 8px; font-size: 14px; outline: none; }
    .input-area input:focus { border-color: #22c55e; }
    .input-area button { background: #22c55e; color: #000; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
    .input-area button:hover { background: #16a34a; }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
    .doc-list { font-size: 12px; color: #737373; margin-top: 4px; }
    .empty { color: #737373; text-align: center; margin-top: 40%; font-size: 14px; }
    textarea.upload-text { width: 100%; background: #141414; border: 1px solid #1e1e1e; color: #e5e5e5; padding: 8px; border-radius: 6px; font-size: 12px; resize: vertical; min-height: 80px; margin-top: 8px; outline: none; }
    input.upload-name { width: 100%; background: #141414; border: 1px solid #1e1e1e; color: #e5e5e5; padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-top: 4px; outline: none; }
    .upload-btn { background: #22c55e !important; color: #000 !important; font-weight: 600; font-size: 12px !important; margin-top: 8px; padding: 6px 12px !important; border: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size: 20px">💩</span>
    <h1>poopabase AI Chat</h1>
    <span class="badge">dogfood</span>
  </div>
  <div class="main">
    <div class="sidebar">
      <h3>Documents</h3>
      <div class="upload-area" onclick="document.getElementById('fileInput').click()">
        📄 Choose File (.md, .txt)
      </div>
      <input type="file" id="fileInput" accept=".md,.txt,.markdown,.csv,.json,.html" style="display:none" onchange="handleFile(this)" />
      <div class="upload-area" style="margin-top:4px" onclick="toggleUpload()">
        ✏️ Paste Text
      </div>
      <div id="uploadForm" style="display:none">
        <input class="upload-name" id="docName" placeholder="Document name..." />
        <textarea class="upload-text" id="docContent" placeholder="Paste markdown content here..."></textarea>
        <button class="sidebar upload-btn" onclick="uploadDoc()">Ingest</button>
      </div>
      <div id="docList" class="doc-list">Loading...</div>

      <h3 style="margin-top: 16px">Conversations</h3>
      <button onclick="newConversation()">+ New Conversation</button>
      <div id="convList"></div>
    </div>
    <div class="chat-area">
      <div class="messages" id="messages">
        <div class="empty">Start a conversation. Upload documents and the AI can search through them.</div>
      </div>
      <div class="input-area">
        <input type="text" id="chatInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendMessage()" />
        <button onclick="sendMessage()" id="sendBtn">Send</button>
      </div>
    </div>
  </div>
  <script>
    const API = '';
    let currentConvId = null;

    async function loadDocs() {
      try {
        const r = await fetch(API + '/health');
        const d = await r.json();
        document.getElementById('docList').innerHTML = d.documents + ' document(s), ' + d.messages + ' message(s), ' + d.observations + ' observation(s)';
      } catch { document.getElementById('docList').innerHTML = 'Error loading'; }
    }

    function toggleUpload() { const f = document.getElementById('uploadForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; }

    async function handleFile(input) {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const name = file.name;
      const msgDiv = document.getElementById('messages');
      msgDiv.innerHTML += '<div class="message system">Uploading ' + escapeHtml(name) + '...</div>';
      const r = await fetch(API + '/docs/ingest', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ source: name, content: text, title: name })
      });
      const d = await r.json();
      msgDiv.innerHTML += '<div class="message system">✓ Ingested ' + escapeHtml(name) + ' (' + d.chunks + ' chunks)</div>';
      msgDiv.scrollTop = 999999;
      input.value = '';
      loadDocs();
    }

    async function uploadDoc() {
      const name = document.getElementById('docName').value || 'Untitled';
      const content = document.getElementById('docContent').value;
      if (!content) return;
      await fetch(API + '/docs/ingest', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ source: name, content, title: name }) });
      document.getElementById('docContent').value = '';
      document.getElementById('docName').value = '';
      document.getElementById('uploadForm').style.display = 'none';
      loadDocs();
    }

    async function newConversation() {
      const r = await fetch(API + '/conversations', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title: 'New Chat' }) });
      const d = await r.json();
      currentConvId = d.id;
      document.getElementById('messages').innerHTML = '<div class="message system">New conversation started</div>';
      loadConversations();
    }

    async function loadConversations() {
      const r = await fetch(API + '/conversations');
      const d = await r.json();
      const list = d.conversations || [];
      document.getElementById('convList').innerHTML = list.map(c =>
        '<button onclick="loadConversation(' + c.id + ')" style="width:100%;margin-top:4px">' + (c.title || 'Chat ' + c.id) + '</button>'
      ).join('');
    }

    async function loadConversation(id) {
      currentConvId = id;
      const r = await fetch(API + '/conversations/' + id);
      const d = await r.json();
      const msgs = d.messages || [];
      document.getElementById('messages').innerHTML = msgs.map(m =>
        '<div class="message ' + m.role + '">' + escapeHtml(m.content) + '</div>'
      ).join('');
      document.getElementById('messages').scrollTop = 999999;
    }

    async function sendMessage() {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      document.getElementById('sendBtn').disabled = true;

      // Show user message immediately
      const msgDiv = document.getElementById('messages');
      if (msgDiv.querySelector('.empty')) msgDiv.innerHTML = '';
      msgDiv.innerHTML += '<div class="message user">' + escapeHtml(msg) + '</div>';
      msgDiv.innerHTML += '<div class="message assistant" id="typing" style="opacity:0.5">Thinking...</div>';
      msgDiv.scrollTop = 999999;

      const r = await fetch(API + '/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ message: msg, conversation_id: currentConvId })
      });
      const d = await r.json();
      currentConvId = d.conversation_id;

      document.getElementById('typing').remove();
      msgDiv.innerHTML += '<div class="message assistant">' + escapeHtml(d.response) + '</div>';
      msgDiv.scrollTop = 999999;
      document.getElementById('sendBtn').disabled = false;
      loadDocs();
      loadConversations();
    }

    function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>'); }

    loadDocs();
    loadConversations();
  </script>
</body>
</html>`;

server.listen(PORT, () => {
  console.log(`\n  💩 poopabase AI Chat`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log(`\n  Features:`);
  console.log(`    - Chat with AI (set OPENROUTER_API_KEY for real LLM)`);
  console.log(`    - Upload documents → agent searches them`);
  console.log(`    - Memory system → agent remembers across conversations`);
  console.log(`    - All data in a single poopabase SQLite file`);
  console.log(`\n  Open in poopabase Studio:`);
  console.log(`    poop studio --db ${DB_PATH}`);
  console.log();
});
