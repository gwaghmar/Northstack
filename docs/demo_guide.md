# Northstack Demo Video Outline (< 4 Minutes)

This guide helps you structure your hackathon demo video to maximize impact for the judges.

## 🕒 Video Structure (Suggested)

### 1. The Hook (0:00 - 0:45)
- **The Problem**: Show yourself struggling with a specific pronunciation (e.g., "The 'th' sound is hard for ESL speakers").
- **Visuals**: Show an old, text-based flashcard app vs. the Northstack landing page.
- **Value Prop**: "Northstack isn't just an LLM. It's a real-time coach that hears your voice and *sees* your mouth."

### 2. Live Interaction (0:45 - 2:30)
- **Native Audio**: Start a session. Talk naturally. Show yourself **interrupting** the agent.
- **Multimodal Coaching**: Show the camera feed with the holographic face mesh. 
- **The "Wow" Moment**: Say something, get feedback, and have the agent render a visual diagram of the tongue position in the sidebar using `render_visual`.
- **Vision Tracking**: Demonstrate how the hand tracking or face tracking reacts to your movement.

### 3. Technical Depth (2:30 - 3:15)
- **Direct WebSocket**: Briefly mention the `@google/genai` direct integration for low latency.
- **Cloud Scale**: Show the Cloud Run console or the architecture diagram from the README.
- **Backend Agents**: Mention how the FastAPI backend manages session history and persistent context.

### 4. Closing & Impact (3:15 - 4:00)
- **The "Why"**: Summarize the potential for language learners globally.
- **Call to Action**: "Check out Northstack on Firebase and help the world speak more clearly."

## 💡 Key Tips for the Video
- **Use Good Audio**: Since this is an audio challenge, clear mic quality is essential.
- **Show, Don't Just Tell**: Don't just talk about the features; show them happening in real-time.
- **No Mockups**: Ensure everything shown is working live in the browser.
- **Highlight Interruptibility**: This is a key "Live" feature. Make sure to demonstrate it!
