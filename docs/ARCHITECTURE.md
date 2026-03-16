# Northstack Architecture

## High-Level Architecture Diagram
This diagram illustrates the real-time flow of audio and visual data between the frontend Next.js application, the backend FastAPI server, the Gemini Live API, and underlying Google Cloud infrastructure.

```mermaid
flowchart TD
    subgraph Frontend ["Frontend (Next.js + React)"]
        direction TB
        Camera[Camera Stream] --> MediaPipe[MediaPipe Face Landmarker]
        Microphone[Audio Capture PCM 16kHz]
        
        MediaPipe --> UI[Coaching UI + 3D Avatar + Overlays]
        Microphone --> WebSocketClient[WebSocket Client]
        UI <--> WebSocketClient
    end

    subgraph Backend ["Backend (Python + FastAPI)"]
        direction TB
        WebSocketServer[WebSocket Endpoint]
        AccentCoach[AccentCoach Agent]
        
        WebSocketServer <--> |"Audio chunks & Commands"| AccentCoach
        AccentCoach <--> |"Streaming LiveClient Input/Output"| GeminiLive["Gemini Live API\n(gemini-2.0-flash-exp)"]
    end

    subgraph GCP ["Google Cloud Infrastructure"]
        direction LR
        Firestore[("Firestore\n(Profiles, Sessions, Scores)")]
        CloudStorage[("Cloud Storage\n(Audio Clips, Assets)")]
        CloudRun["Cloud Run\n(Serverless Hosting)"]
    end

    WebSocketClient <-->|"Bidirectional WSS\n(Audio, Status, Responses)"| WebSocketServer
    AccentCoach --> Firestore
    AccentCoach --> CloudStorage
    Backend -.-> |Hosted on| CloudRun
```

## Description
1. **Frontend**: A Next.js application captures real-time video using MediaPipe for face and mouth shape (blendshapes) tracking, and audio for speech evaluation. It maintains a stateful WebSocket connection to the backend.
2. **Backend**: FastAPI streams the bidirectional audio leveraging the `google-genai` Live API connection. The python script handles session orchestration asynchronously using separate send and receive queues. 
3. **Data**: Session scores and performance statistics are persisted to Firestore, allowing users to track their accent improvement over time.
