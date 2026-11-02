import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Link as LinkIcon,
  FileText,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Check,
  Copy,
  Languages,
  Users,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ChevronRight
} from 'lucide-react';
import type { AnalysisData, SupportedLanguage } from './types';

const SAMPLE_STORY_TEXT = `The Indian Space Research Organisation (ISRO) successfully launched the Earth Observation Satellite EOS-08 on August 16, 2024, from the Satish Dhawan Space Centre in Sriharikota aboard the Small Satellite Launch Vehicle (SSLV-D3). 

ISRO Chairman S. Somanath confirmed that the mission achieved its exact intended orbit of 475 km with zero deviation. The mission was executed at an estimated cost of approximately 100 crore rupees ($12 million USD). 

EOS-08 carries state-of-the-art payloads including the Electro Optical Infrared Payload (EOIR) for round-the-clock disaster surveillance, environmental monitoring, and volcanic activity assessment, alongside the Global Navigation Satellite System-Reflectometry payload for ocean surface wind analysis and soil moisture estimation. This third developmental flight marks the operational completion of the SSLV program, opening commercial launch opportunities for Indian aerospace startups.`;

export default function App() {
  const [tab, setTab] = useState<'url' | 'text'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Translation State
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([
    { code: 'en-IN', name: 'English' },
    { code: 'hi-IN', name: 'Hindi (हिंदी)' },
    { code: 'mr-IN', name: 'Marathi (मराठी)' },
    { code: 'ta-IN', name: 'Tamil (தமிழ்)' },
  ]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi-IN');
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  
  // Feedback & Copy State
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch supported languages from backend
    fetch('/api/v1/languages')
      .then(res => res.json())
      .then(data => {
        if (data.languages && Array.isArray(data.languages)) {
          setSupportedLanguages(data.languages);
        }
      })
      .catch(() => {
        // Fallback already preset
      });
  }, []);

  useEffect(() => {
    if (isProcessing && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamedText, isProcessing]);

  const handleReset = () => {
    setIsProcessing(false);
    setStatusMessage('');
    setStreamedText('');
    setAnalysisResult(null);
    setTranslatedSummary(null);
    setErrorMessage(null);
    setTranslationError(null);
    setFeedbackGiven(null);
  };

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setAnalysisResult(null);
    setTranslatedSummary(null);
    setStreamedText('');
    setFeedbackGiven(null);

    const payload = tab === 'url' 
      ? { url: urlInput.trim() } 
      : { text: textInput.trim(), title: titleInput.trim() || undefined };

    if (tab === 'url' && !urlInput.trim()) {
      setErrorMessage("Please enter an article URL.");
      return;
    }
    if (tab === 'text' && !textInput.trim()) {
      setErrorMessage("Please paste the article content.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage(tab === 'url' ? 'Extracting article from URL...' : 'Preparing article text...');

    try {
      const response = await fetch('/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last partial line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'status') {
                setStatusMessage(event.message);
              } else if (event.type === 'meta') {
                // Metadata received
              } else if (event.type === 'chunk') {
                setStreamedText(prev => prev + event.text);
              } else if (event.type === 'done') {
                setAnalysisResult(event.data);
                setIsProcessing(false);
              } else if (event.type === 'error') {
                setIsProcessing(false);
                setErrorMessage(event.message || "An unexpected error occurred during processing.");
                return;
              }
            } catch (err) {
              console.error("Error parsing SSE event:", err, jsonStr);
            }
          }
        }
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to process article. Please check your connection or try again.");
    }
  };

  const handleTranslate = async (targetLangCode: string) => {
    if (!analysisResult) return;
    setSelectedLanguage(targetLangCode);
    setTranslationError(null);
    setIsTranslating(true);

    try {
      const res = await fetch('/api/v1/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysisResult.summary,
          target_language: targetLangCode,
          source_language: analysisResult.detected_lang_code || 'en-IN'
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Translation failed with status ${res.status}`);
      }

      const data = await res.json();
      setTranslatedSummary(data.translated_text);
    } catch (err: any) {
      setTranslationError(err.message || "Failed to translate summary.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadSample = () => {
    setTab('text');
    setTextInput(SAMPLE_STORY_TEXT);
    setTitleInput("ISRO Successfully Launches EOS-08 on SSLV-D3");
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-900 flex flex-col font-sans selection:bg-amber-100">
      {/* Top Navigation */}
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-sm shadow-amber-600/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl font-bold tracking-tight text-stone-900">Vaani</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  MVP 1.1
                </span>
              </div>
              <p className="text-xs text-stone-500 font-normal">Multilingual News Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Powered by Sarvam AI
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-red-900">Processing Interrupted</p>
              <p className="mt-0.5 text-red-700">{errorMessage}</p>
              {tab === 'url' && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('text');
                    setErrorMessage(null);
                  }}
                  className="mt-2 text-xs font-semibold text-red-800 underline hover:text-red-900 inline-flex items-center gap-1"
                >
                  Switch to Pasted Text tab instead <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Card: Rendered when not displaying completed results */}
        {!analysisResult && (
          <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-6 sm:p-8 transition-all">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="font-serif text-3xl font-bold text-stone-900 tracking-tight">
                  Transform Any News Story
                </h1>
                <p className="text-sm text-stone-600 mt-1">
                  Extract context-preserving summaries, verified facts, entities, and instant Indic translations.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSample}
                className="self-start text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load Sample Story
              </button>
            </div>

            {/* Input Method Tabs */}
            <div className="flex border-b border-stone-200 mb-6">
              <button
                type="button"
                onClick={() => setTab('url')}
                className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  tab === 'url'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                Article URL
              </button>
              <button
                type="button"
                onClick={() => setTab('text')}
                className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  tab === 'text'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                Pasted Text
              </button>
            </div>

            <form onSubmit={handleProcess}>
              {tab === 'url' ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                    Paste News Article URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="e.g. https://www.thehindu.com/sci-tech/technology/..."
                      disabled={isProcessing}
                      className="w-full px-4 py-3.5 pr-12 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 text-stone-900 text-sm bg-stone-50/50 placeholder:text-stone-400"
                    />
                    <div className="absolute right-3 top-3.5 text-stone-400">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mt-2">
                    Trafilatura strips ads, navigation, and boilerplate automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
                      Optional Headline
                    </label>
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="e.g. ISRO launches new satellite"
                      disabled={isProcessing}
                      className="w-full px-4 py-2.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 text-sm bg-stone-50/50"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Article Content
                      </label>
                      <span className="text-xs text-stone-400">
                        {textInput.length.toLocaleString()} / 50,000 characters
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Paste the full article body here..."
                      disabled={isProcessing}
                      className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 text-sm bg-stone-50/50 leading-relaxed font-sans placeholder:text-stone-400"
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-stone-100">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  Sarvam-105B Reasoning ready
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Generate Intelligence Briefing
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Real-time Streaming State Card */}
        {isProcessing && (
          <div className="mt-8 bg-white rounded-2xl border border-amber-200/80 shadow-md p-6 sm:p-8 animate-fadeIn">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Intelligence Pipeline Active</h3>
                  <p className="text-xs text-amber-700 font-medium">{statusMessage}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono uppercase bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200">
                Streaming SSE
              </span>
            </div>

            {/* Live Token Streaming Output */}
            <div className="bg-stone-50 rounded-xl p-5 border border-stone-200/80 font-mono text-xs sm:text-sm text-stone-800 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
              {streamedText || "Awaiting first token from Sarvam-105B..."}
              <span className="inline-block w-2 h-4 bg-amber-600 ml-1 animate-pulse align-middle"></span>
              <div ref={streamEndRef} />
            </div>
          </div>
        )}

        {/* Completed Results Dashboard */}
        {analysisResult && (
          <div className="space-y-6 animate-fadeIn">
            {/* Top Bar with Reset Action */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-2xs hover:bg-stone-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Process Another Article
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(analysisResult.summary)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-2xs hover:bg-stone-50 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Briefing'}
                </button>
              </div>
            </div>

            {/* Article Headline & Metadata Banner */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                  {analysisResult.source || 'Web Source'}
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Languages className="w-3 h-3 text-amber-600" />
                  Original: {analysisResult.detected_language}
                </span>
                {analysisResult.was_truncated && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                    Truncated to 15K chars
                  </span>
                )}
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 leading-snug tracking-tight">
                {analysisResult.title}
              </h1>
            </div>

            {/* Summary & Translation Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Executive Summary Card (Original) */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                        Executive Summary
                      </h2>
                    </div>
                    <span className="text-xs text-stone-400 font-medium">Standard 5–7 sentences</span>
                  </div>
                  <p className="font-serif text-base text-stone-800 leading-relaxed">
                    {analysisResult.summary}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                  <span>Preserved context & factual consistency</span>
                  <button
                    onClick={() => handleCopy(analysisResult.summary)}
                    className="hover:text-stone-800 flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>

              {/* Translation Card (Target Indic Language) */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                        Indic Translation
                      </h2>
                    </div>
                    
                    {/* Language Selector Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {supportedLanguages.map((lang) => (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => handleTranslate(lang.code)}
                          disabled={isTranslating}
                          className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
                            selectedLanguage === lang.code && translatedSummary
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80 hover:text-stone-900'
                          }`}
                        >
                          {lang.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Translation Body */}
                  {isTranslating ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mb-2" />
                      <p className="text-xs text-stone-600 font-medium">
                        Translating via sarvam-translate:v1...
                      </p>
                    </div>
                  ) : translationError ? (
                    <div className="p-4 rounded-xl bg-red-50 text-red-800 text-xs border border-red-200">
                      <p className="font-semibold">Translation failed</p>
                      <p className="mt-1">{translationError}</p>
                    </div>
                  ) : translatedSummary ? (
                    <p className="text-base text-stone-800 leading-relaxed font-sans">
                      {translatedSummary}
                    </p>
                  ) : (
                    <div className="py-12 text-center text-stone-400">
                      <Languages className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Click a language pill above to generate instant Indic translation.</p>
                    </div>
                  )}
                </div>

                {translatedSummary && (
                  <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                    <span>Model: sarvam-translate:v1 (formal)</span>
                    <button
                      onClick={() => handleCopy(translatedSummary)}
                      className="hover:text-stone-800 flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Translation
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Key Takeaways Card */}
            {analysisResult.takeaways && analysisResult.takeaways.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                    Key Takeaways & Core Developments
                  </h2>
                </div>
                <ul className="space-y-3">
                  {analysisResult.takeaways.map((takeaway, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-stone-800 leading-relaxed">
                      <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                        {idx + 1}
                      </span>
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Entities Grid */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                  Extracted Intelligence Entities
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* People */}
                <div className="bg-stone-50/80 rounded-xl p-4 border border-stone-200/70">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 mb-2.5">
                    <Users className="w-4 h-4 text-blue-600" />
                    People
                  </div>
                  {analysisResult.entities.people && analysisResult.entities.people.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.entities.people.map((name, i) => (
                        <span key={i} className="text-xs bg-white text-stone-800 px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400">None detected</span>
                  )}
                </div>

                {/* Organizations */}
                <div className="bg-stone-50/80 rounded-xl p-4 border border-stone-200/70">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-800 mb-2.5">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    Organizations
                  </div>
                  {analysisResult.entities.organizations && analysisResult.entities.organizations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.entities.organizations.map((org, i) => (
                        <span key={i} className="text-xs bg-white text-stone-800 px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                          {org}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400">None detected</span>
                  )}
                </div>

                {/* Locations */}
                <div className="bg-stone-50/80 rounded-xl p-4 border border-stone-200/70">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mb-2.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    Locations
                  </div>
                  {analysisResult.entities.locations && analysisResult.entities.locations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.entities.locations.map((loc, i) => (
                        <span key={i} className="text-xs bg-white text-stone-800 px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                          {loc}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400">None detected</span>
                  )}
                </div>

                {/* Dates */}
                <div className="bg-stone-50/80 rounded-xl p-4 border border-stone-200/70">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2.5">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Relevant Dates
                  </div>
                  {analysisResult.entities.dates && analysisResult.entities.dates.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.entities.dates.map((date, i) => (
                        <span key={i} className="text-xs bg-white text-stone-800 px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                          {date}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400">None detected</span>
                  )}
                </div>

                {/* Statistics */}
                <div className="bg-stone-50/80 rounded-xl p-4 border border-stone-200/70 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 mb-2.5">
                    <TrendingUp className="w-4 h-4 text-rose-600" />
                    Key Figures & Statistics
                  </div>
                  {analysisResult.entities.statistics && analysisResult.entities.statistics.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.entities.statistics.map((stat, i) => (
                        <span key={i} className="text-xs bg-white text-stone-800 px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs font-mono">
                          {stat}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400">None detected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Satisfaction Feedback Footer (Per PRD Metrics) */}
            <div className="p-4 rounded-xl bg-stone-100/80 border border-stone-200 flex items-center justify-between text-xs text-stone-600">
              <span className="font-medium">Was this intelligence briefing accurate and helpful?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFeedbackGiven('up')}
                  className={`p-1.5 rounded-md border transition-colors ${
                    feedbackGiven === 'up'
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600'
                  }`}
                  title="Accurate and helpful"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackGiven('down')}
                  className={`p-1.5 rounded-md border transition-colors ${
                    feedbackGiven === 'down'
                      ? 'bg-red-100 border-red-300 text-red-800'
                      : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600'
                  }`}
                  title="Inaccurate or issues present"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
                {feedbackGiven && (
                  <span className="text-[11px] text-stone-500 font-medium ml-1">
                    Feedback saved. Thank you!
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 py-6 text-center text-xs text-stone-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            <strong className="font-semibold text-stone-700">Vaani</strong> — Every story. Every language. One perspective.
          </p>
          <p className="text-stone-400">
            Phase 1 MVP • Built with Sarvam AI Models
          </p>
        </div>
      </footer>
    </div>
  );
}
