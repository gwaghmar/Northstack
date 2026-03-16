/**
 * VisualCanvas — renders Gemini-generated interactive HTML inside a sandboxed iframe.
 * Has a sticky header bar with title + close button always visible at the top.
 */
import { useEffect, useRef, useState, memo } from 'react';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { FunctionDeclaration, LiveServerToolCall, Type } from '@google/genai';

export const RENDER_VISUAL_DECLARATION: FunctionDeclaration = {
  name: 'generate_visual_aid',
  description:
    'Renders an interactive HTML visualization, diagram, chart, or explanation in the main display area. ' +
    'Use this whenever asked to "show", "visualize", "draw", "explain visually", or "create a diagram". ' +
    'The html parameter must be a self-contained HTML page with all styles and scripts inline. ' +
    'Use Tailwind CDN, Chart.js CDN, or vanilla JS as needed. Make it dark-themed and visually rich.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      html: {
        type: Type.STRING,
        description:
          'Complete, self-contained HTML document. Must include <!DOCTYPE html> and all CSS/JS inline or via CDN. Dark background preferred.',
      },
      title: {
        type: Type.STRING,
        description: 'Short title for the visual (shown in the header bar).',
      },
    },
    required: ['html'],
  },
};

interface VisualState {
  html: string;
  title: string;
}

function VisualCanvasComponent() {
  const { client } = useLiveAPIContext();
  const [visual, setVisual] = useState<VisualState | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      const fc = toolCall.functionCalls?.find((fc) => fc.name === 'generate_visual_aid');
      if (!fc) return;
      const args = fc.args as any;
      setVisual({ html: args.html || '', title: args.title || 'Visual' });
      client.sendToolResponse({
        functionResponses: [
          { response: { output: { success: true } }, id: fc.id, name: fc.name },
        ],
      });
    };
    client.on('toolcall', onToolCall);
    return () => { client.off('toolcall', onToolCall); };
  }, [client]);

  if (!visual) return null;

  return (
    <div className="visual-canvas">
      {/* Always-visible header — close button is large and obvious */}
      <div className="visual-canvas__header">
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--Blue-400)' }}>
          auto_awesome
        </span>
        <span className="visual-canvas__title">{visual.title}</span>
        <button
          className="visual-canvas__close"
          onClick={() => setVisual(null)}
          title="Close"
          aria-label="Close visual"
        >
          <span className="material-symbols-outlined">close</span>
          Close
        </button>
      </div>
      <div className="visual-canvas__body">
        <iframe
          ref={iframeRef}
          className="visual-canvas__iframe"
          srcDoc={visual.html}
          sandbox="allow-scripts allow-same-origin"
          title={visual.title}
        />
      </div>
    </div>
  );
}

export const VisualCanvas = memo(VisualCanvasComponent);
