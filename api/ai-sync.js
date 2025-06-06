import admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ——————————————————————————————————————————————————————————
// Initialize Firebase Admin only once (handle Vercel hot reloads)
// ——————————————————————————————————————————————————————————
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = getFirestore();

// ——————————————————————————————————————————————————————————
// Vercel function handler
// ——————————————————————————————————————————————————————————
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { userId, messageText } = req.body;
  if (!userId || !messageText) {
    res.status(400).json({ error: "Missing userId or messageText" });
    return;
  }

  try {
    // a) Save user message to Firestore
    const chatCol = firestore.collection("chat_messages");
    const newDocRef = chatCol.doc();
    await newDocRef.set({
      userId,
      messageText,
      timestamp: Timestamp.now(),
    });

    // b) Call Gemini API (corrected)
    const endpoint =
      "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";
    const apiKey = process.env.GEMINI_API_KEY;

    const aiPayload = {
      contents: [
        {
          role: "user",
          parts: [{ text: messageText }],
        },
      ],
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
      aiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI";

    // c) Save AI response to Firestore
    await newDocRef.update({
      responseText,
      botTimestamp: Timestamp.now(),
    });

    // d) Return AI response
    res.status(200).json({ responseText });
  } catch (error) {
    console.error("Error in ai-sync:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
