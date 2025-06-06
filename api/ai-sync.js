import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ——————————————————————————————————————————————————————————
// 1) Initialize Firebase Admin using SERVICE ACCOUNT JSON pulled
//    from the environment variable FIREBASE_SERVICE_ACCOUNT.
// 2) Initialize Firestore (db).
// ——————————————————————————————————————————————————————————

let firestore;
if (!initializeApp.length) {
  // In case Vercel hot‐restarts, guard against re‐initializing:
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );
  initializeApp({
    credential: cert(serviceAccount),
  });
  firestore = getFirestore();
} else {
  // In Vercel's cold start, initializeApp already ran:
  firestore = getFirestore();
}

// ——————————————————————————————————————————————————————————
// 3) Handler: expects POST with { userId, messageText } in JSON body.
//    a) Write user message to Firestore under collection "chat_messages"
//    b) Call Gemini AI API to get a bot response
//    c) Write the bot response back to Firestore (same doc ID, under field responseText)
//    d) Return { responseText } in JSON to the caller.
// ——————————————————————————————————————————————————————————

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // 1) Extract userId and messageText from the request body
  const { userId, messageText } = req.body;
  if (!userId || !messageText) {
    res.status(400).json({ error: "Missing userId or messageText" });
    return;
  }

  try {
    // —————————————————————————————————————————————
    // a) Save the user’s message to Firestore under "chat_messages/{newDocId}"
    // —————————————————————————————————————————————
    const chatCol = firestore.collection("chat_messages");
    const newDocRef = chatCol.doc(); // auto‐ID
    await newDocRef.set({
      userId: userId,
      messageText: messageText,
      timestamp: Timestamp.now(),
      // responseText is not set yet
    });

    // —————————————————————————————————————————————
    // b) Call Gemini AI API to get a bot response
    //    (replace endpoint + payload with whatever your Gemini docs say)
    // —————————————————————————————————————————————
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
    const apiKey = process.env.GEMINI_API_KEY;

    const aiPayload = {
      prompt: { text: messageText },
      // (You can add “temperature”, “maxTokens”, etc. if Gemini accepts them)
    };

    const aiFetch = await fetch(`${endpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiPayload),
    });
    if (!aiFetch.ok) {
      const msg = await aiFetch.text();
      throw new Error(`Gemini API error: ${msg}`);
    }
    const aiData = await aiFetch.json();
    const responseText =
      aiData?.candidates?.[0]?.output || "No response from AI";

    // —————————————————————————————————————————————
    // c) Save the bot’s response back into the same Firestore doc:
    //    chat_messages/{newDocId}.responseText = responseText
    // —————————————————————————————————————————————
    await newDocRef.update({
      responseText: responseText,
      botTimestamp: Timestamp.now(),
    });

    // —————————————————————————————————————————————
    // d) Finally return the AI response to whoever called this endpoint
    // —————————————————————————————————————————————
    res.status(200).json({ responseText });
  } catch (error) {
    console.error("Error in ai-sync:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
