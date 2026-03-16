import Head from 'next/head';
import dynamic from 'next/dynamic';

// Load the entire console client-only — it uses window, AudioContext, WebSockets
const GeminiLiveConsole = dynamic(
  () => import('@/components/GeminiLiveConsole'),
  { ssr: false }
);

export default function Home() {
  return (
    <>
      <Head>
        <title>Northstack — Gemini Live</title>
        <meta name="description" content="Real-time multimodal AI with Gemini Live API" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <GeminiLiveConsole />
    </>
  );
}
