const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");



dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const allowedVoiceIds = [
  "Elliot", "Kylie", "Rohan", "Lily", "Savannah",
  "Hana", "Neha", "Cole", "Harry", "Paige", "Spencer"
];

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/api/call", async (req, res) => {
  const { candidateName, phoneNumber, voiceId } = req.body;

  if (!candidateName || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: candidateName and phoneNumber"
    });
  }

  if (!process.env.VAPI_API_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
    return res.status(500).json({
      success: false,
      error: "Missing environment variables. Ensure VAPI_API_KEY and VAPI_PHONE_NUMBER_ID are set."
    });
  }

  const selectedVoiceId = allowedVoiceIds.includes(voiceId) ? voiceId : "Rohan";

  try {
    // Create assistant
    const assistantRes = await axios.post(
      "https://api.vapi.ai/assistant",
      {
        name: "AI Recruiter Assistant",
        serverUrl: "https://backend-mutualfund-simulator.onrender.com/api/vapi/webhook",
        firstMessage: `Hello`,
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
              content: `
              You are playing the role of a cautious Indian customer named Neha Agarwala, based in Kolkata, receiving a cold call from a sales representative promoting mutual fund products. You are not confident about financial products, especially from unknown sources, and you generally rely on family or trusted contacts when it comes to money matters.
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
 “Yes, that would help. Please send it over first.”`
            }
          ]
        },
        transcriber: {
          provider: "deepgram",
          language: "en"
        },
        analysisPlan: {
      summaryPrompt: "You are an expert evaluator for customer service calls. Given the call transcript, generate a structured report with these sections:\n- 📌 Call Summary: Briefly describe the scenario and flow.\n- ✅ What the Caller Did Well: List positive behaviors and strategies.\n- ❌ Areas for Improvement: List issues, missed opportunities, or unclear explanations.\n- 🎯 Overall Effectiveness Score: Give a score out of 10 and justify it.\n- 🧾 Final Summary for Report: Summarize the overall impression and suggest next steps.\nFormat your response with clear section headers and concise bullet points."
    }
        // 🔴 Transcript webhook removed
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`
        }
      }
    );

    const assistantId = assistantRes.data.id;

    // Start call
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

// Optional: Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send("API is up and running.");
});

// Get summary of a specific call
app.get("/api/summary/:callId", async (req, res) => {
  const { callId } = req.params;

  if (!callId) {
    return res.status(400).json({
      success: false,
      error: "Missing callId in request parameters."
    });
  }

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
    console.error("Failed to fetch call summary:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || "Failed to fetch call summary"
    });
  }
});

// Get specific call log by callId
app.get("/api/call-logs/:callId", async (req, res) => {
  const { callId } = req.params;

  try {
    // Step 1: Fetch the call transcript from Vapi
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: "GET",
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

    // Step 2: Use Gemini 1.5 Flash to generate performance synopsis
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });

    const result = await model.generateContent([
      {
        text: `
You are an AI evaluator reviewing a sales call transcript. Your job is to output a structured, visually appealing summary of the sales agent’s performance.

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
        `
      }
    ]);

    const summary = result.response.text().trim();

    // Step 3: Save and serve as .txt file
    const fileName = `call-summary-${callId}.txt`;
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, summary);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).json({ success: false, error: "Failed to send file" });
      } else {
        fs.unlinkSync(filePath); // Clean up after sending
      }
    });

  } catch (error) {
    console.error("Error fetching transcript or generating summary:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      detail: error.message
    });
  }
});
 

app.post('/api/vapi/webhook', async (req, res) => {
  const { type, call, summary, transcript } = req.body;

  if (!type) {
    return res.status(400).send('Missing type in payload.');
  }

  if (type === 'end-of-call-report') {
    console.log('📋 End of call report received');
    console.log('📝 Summary:', summary);
    console.log('🗣 Transcript:', transcript);
    if (call?.id) console.log('📞 Call ID:', call.id);
  } else if (type === 'status-update' && call) {
    console.log(`📞 Webhook received - Call ID: ${call.id}, Status: ${call.status}`);
  } else {
    console.log('ℹ️ Unknown webhook type:', type);
  }

  res.status(200).send('OK');
});


  

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

