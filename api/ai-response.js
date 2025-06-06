export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message, messageId } = req.body;
  if (!message || !messageId) {
    res.status(400).json({ error: "Message and messageId are required" });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
    const body = { prompt: { text: message } };

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const data = await response.json();
    const aiResponse = data?.candidates?.[0]?.output || "No AI response";

    // Save AI response back into Firestore, in the same document as original message
    const messageRef = doc(db, "messages", messageId);
    await setDoc(messageRef, { response_text: aiResponse }, { merge: true });

    res.status(200).json({ response: aiResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
