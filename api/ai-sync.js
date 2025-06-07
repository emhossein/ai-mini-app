import admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = getFirestore();

export default async function handler(req, res) {
  // ——————————————————————————————————
  // Add CORS Headers
  // ——————————————————————————————————
  res.setHeader("Access-Control-Allow-Origin", "*"); // Or replace "*" with your domain
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ——————————————————————————————————
  // Handle preflight OPTIONS request
  // ——————————————————————————————————
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ——————————————————————————————————
  // Only accept POST
  // ——————————————————————————————————
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, messageText } = req.body;
  if (!userId || !messageText) {
    return res.status(400).json({ error: "Missing userId or messageText" });
  }

  try {
    // 1. Save user message to Firestore
    const userMessagesCol = firestore.collection("user_messages");
    const docRef = userMessagesCol.doc(); // Auto-ID

    const initialData = {
      userId,
      messageText,
      timestamp: Timestamp.now(),
    };

    await docRef.set(initialData);

    // 2. Gemini AI call
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
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

    // 3. Save AI response
    await docRef.update({
      responseText,
      botTimestamp: Timestamp.now(),
    });

    // 4. Respond to client
    res.status(200).json({ responseText });
  } catch (error) {
    console.error("Error in ai-sync:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
