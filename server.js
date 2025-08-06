const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Change to your frontend URL in production
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const allowedVoiceIds = [
  "Elliot", "Kylie", "Rohan", "Lily", "Savannah",
  "Hana", "Neha", "Cole", "Harry", "Paige", "Spencer"
];

// Store connected sockets
io.on("connection", (socket) => {
  console.log("⚡ Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

app.post("/api/call", async (req, res) => {
  const { candidateName, phoneNumber, voiceId } = req.body;

  if (!candidateName || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: candidateName and phoneNumber"
    });
  }

  const selectedVoiceId = allowedVoiceIds.includes(voiceId) ? voiceId : "Rohan";

  try {
    const assistantRes = await axios.post(
      "https://api.vapi.ai/assistant",
      {
        name: "AI Recruiter Assistant",
        serverUrl: "https://backend-mutualfund-simulator.onrender.com/api/vapi/webhook",
        firstMessage: "Hello",
        firstMessageMode: "assistant-speaks-first",
        voice: {
          provider: "vapi",
          voiceId: selectedVoiceId
        },
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "assistant",
              content: `You are playing the role of a cautious Indian customer named Neha Agarwala, based in Kolkata, receiving a cold call from a sales representative promoting mutual fund products. You are not confident about financial products, especially from unknown sources, and you generally rely on family or trusted contacts when it comes to money matters.
Your behavior should reflect how a typical skeptical but polite Indian consumer responds to an unsolicited financial call. You are not rigidly negative, but rather unsure, suspicious, and hesitant.

🎭 Persona & Tone:
You are a skeptical, soft-spoken individual in your early 30s.


You don't have much understanding of mutual funds.


You usually prefer FDs, LICs, or savings accounts because they feel "safe."


You are fearful of being scammed over the phone.


You speak cautiously, often repeat questions, and seek reassurance.


You're uncomfortable sharing personal details (like your address or income) without trust.



🧠 Behavioral Instructions:
Let the sales rep lead the conversation.
 Do not proactively bring up mutual funds unless asked or prompted.


Express doubt and confusion about investment terms like “SIP,” “small-cap,” “returns,” etc.
 Ask the rep to explain simply — like you’re hearing this for the first time.


If the sales rep tries to build trust using a referral:


Say you’re unsure who the person is, even if they mention a name.


But don’t reject them rudely — allow them to speak further.


Always ask where the caller got your number from, especially early in the conversation.
 This is a red flag for you and you want to ensure it's not a scam.


Do not trust easily.
 Avoid saying “yes” too quickly. Instead, say things like:


“Let me think about it...”


“I’ll need to discuss with my family…”


“Can you send me more details first?”


If the rep offers to visit:


Say you’re not comfortable sharing your address yet.


You can say: “Let me first see the documents or brochure on WhatsApp.”


Only if the rep is very clear, polite, and reassuring, and answers your doubts well, you may say:


“Okay, maybe I’ll consider it.”


“I’ll look at the info and decide.”


Do not directly confirm a meeting unless fully convinced.



❌ What NOT to Do:
Do not sound like an expert or use confident financial language.


Do not dismiss the caller outright — listen and ask questions instead.


Do not initiate financial discussions or talk about mutual funds unless the sales rep brings it up.



✅ Sample Dialogue Snippets (Tone Guidance)
“Sorry… mutual funds? I’ve heard the name, but I really don’t know much.”


“Honestly… I only do fixed deposits or LIC. They feel safer.”


“Are you sure this is not risky? It sounds a little complicated…”


“Where did you get my number from?”


“Umm… I don’t know who Rahul is. Maybe my husband knows?”


“I’m not very comfortable sharing my address right now. Can you send something first on WhatsApp?”


“Let me think about it. I’ll need to discuss it with my family…”



📍 Other Contextual Details:
You live in Kolkata — so if the rep refers to the city or locality, respond accordingly.


If the rep explains well, acknowledge their effort:
 “Thanks for explaining… it’s still a bit confusing, but I’ll try to understand.”


If they mention they’ll share details:
 “Yes, that would help. Please send it over first.”` // truncated for brevity
            }
          ]
        },
        transcriber: {
          provider: "deepgram",
          language: "en"
        },
        analysisPlan: {
          summaryPrompt: "You are an expert evaluator for customer service calls..."
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`
        }
      }
    );

    const assistantId = assistantRes.data.id;

    const callRes = await axios.post(
      "https://api.vapi.ai/call",
      {
        customer: {
          number: phoneNumber,
          name: candidateName
        },
        assistantId,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`
        }
      }
    );

    res.status(200).json({
      success: true,
      assistantId,
      callId: callRes.data.id
    });
  } catch (err) {
    console.error("Call failed:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || "Call initiation failed"
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).send("API is up and running.");
});

app.get("/api/summary/:callId", async (req, res) => {
  const { callId } = req.params;

  try {
    const response = await axios.get(`https://api.vapi.ai/call/${callId}`, {
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`
      }
    });

    const summary = response.data.analysis?.summary;

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: "No summary available yet. Please try again later."
      });
    }

    res.status(200).json({
      success: true,
      summary
    });
  } catch (error) {
    console.error("Failed to fetch call summary:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch call summary"
    });
  }
});

app.get("/api/call-logs/:callId", async (req, res) => {
  const { callId } = req.params;

  try {
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ success: false, error });
    }

    const data = await response.json();
    const transcript = data.transcript || data.artifact?.transcript || "Transcript not available yet.";

    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });

    const result = await model.generateContent([
      {
        text: `You are an AI evaluator reviewing a sales call transcript. Your job is to output a structured, visually appealing summary of the sales agent’s performance.

🔹 Use the format below.
🔹 Include a markdown-style table with:
  - Score (1–5)
  - Observations
  - Remarks
🔹 Include a clear Final Assessment section.

---

### 📊 Sales Call Performance Synopsis

| **Criteria**                   | **Score (1–5)** | **Observations**                              | **Remarks**                                          |
|--------------------------------|-----------------|------------------------------------------------|------------------------------------------------------|
| Introduction Clarity           |                 |                                                |                                                      |
| Handling Initial Rejection     |                 |                                                |                                                      |
| Building Trust                 |                 |                                                |                                                      |
| Listening Skills               |                 |                                                |                                                      |
| Product Explanation Clarity    |                 |                                                |                                                      |
| Objection Handling             |                 |                                                |                                                      |
| Lead Qualification             |                 |                                                |                                                      |
| Closing Attempt                |                 |                                                |                                                      |

---

### ✅ Final Assessment

- **⭐ Overall Salesmanship:** x / 5
- **🤝 Customer Engagement Success:** Yes/No with explanation
- **📞 Call Outcome:** e.g., closed, follow-up scheduled, dropped

---

📜 **Transcript**:
"""
${transcript}
"""
ADDITIONAL INSTRUCTIONS
Always give same analysis for same set of transcripts
  `
      }
    ]);

    const summary = result.response.text().trim();
    const fileName = `call-summary-${callId}.txt`;
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, summary);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).json({ success: false, error: "Failed to send file" });
      } else {
        fs.unlinkSync(filePath);
      }
    });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// ✅ Webhook + Socket Trigger
app.post('/api/vapi/webhook', (req, res) => {
  const { message } = req.body;

  if (!message || !message.type) {
    return res.status(400).send('Missing message type.');
  }

  if (message.type === 'status-update') {
    console.log('📞 Status Update:', message.status);
    if (message.call && message.call.id) {
      console.log('📞 Call ID:', message.call.id);
      if (message.status === "ended") {
        // ✅ Notify frontend via socket
        io.emit("call-ended", { callId: message.call.id });
        console.log("📢 Emitted 'call-ended' via socket.io");
      }
    }
  }

  if (message.type === 'end-of-call-report') {
    console.log('📋 End of Call Report');
    if (message.transcript) {
      console.log('🗣 Transcript:', message.transcript);
    }
    if (message.call && message.call.id) {
      console.log('📞 Call ID:', message.call.id);
    }
  }

  res.status(200).send('OK');
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

