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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, messageText } = req.body;
  if (!userId || !messageText) {
    return res.status(400).json({ error: "Missing userId or messageText" });
  }

  try {
    // 1. Save user message initially to Firestore
    const userMessagesCol = firestore.collection("user_messages");
    const docRef = userMessagesCol.doc(); // Auto-ID

    const initialData = {
      userId,
      messageText,
      timestamp: Timestamp.now(),
    };

    await docRef.set(initialData);

    // 2. Call Gemini AI API
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const apiKey = process.env.GEMINI_API_KEY;

    const aiPayload = {
      prompt: { text: messageText },
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

    // 3. Update the same doc with AI response
    await docRef.update({
      responseText,
      botTimestamp: Timestamp.now(),
    });

    // 4. Return AI response
    res.status(200).json({ responseText });
  } catch (error) {
    console.error("Error in ai-sync:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
